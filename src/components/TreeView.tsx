/** biome-ignore-all lint/a11y/noStaticElementInteractions: SVG/pan-zoom container elements */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: SVG/pan-zoom container elements */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: decorative tree graph SVG */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: connection lines are static */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: stable helper functions */
/** biome-ignore-all lint/correctness/noChildrenProp: prop named children is intentional */
/** biome-ignore-all lint/style/useExponentiationOperator: use ** instead of Math.pow */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "../lib/dateFormatter";
import type { GedcomData, Individual } from "../lib/gedcomParser";
import { PersonDetails } from "./PersonDetails";
import "./PersonDetails.css";
import type { TreeConnection, TreeNode } from "../lib/treeBuilder";

const NODE_WIDTH = 140;
const NODE_HEIGHT = 55;

interface TreeViewProps {
    nodes: TreeNode[];
    connections: TreeConnection[];
    focusedId: string | null;
    setFocusedId: (id: string | null) => void;
    totalWidth: number;
    totalHeight: number;
    gedcomData: GedcomData;
    theme: string;
    onPhotoClick?: (urls: string[], index: number) => void;
}

export function TreeView({
    nodes,
    connections,
    focusedId,
    setFocusedId,
    totalWidth,
    totalHeight,
    gedcomData,
    theme,
    onPhotoClick,
}: TreeViewProps) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: -3000, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [isFocusing, setIsFocusing] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const didDragRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const transformRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number | null>(null);

    const getFocusedPersonInfo = () => {
        if (!focusedId) return null;

        const individual = gedcomData.individuals.get(focusedId);
        if (!individual) return null;

        // 获取父母
        const parentFamilies = individual.families.filter((f) => f.type === "child");
        const parents: Individual[] = [];
        const parentRelations = new Map<string, string>();
        parentFamilies.forEach((famConn) => {
            const family = gedcomData.families.get(famConn.id);
            const pedi = famConn.pedi;
            if (family?.husband) {
                const father = gedcomData.individuals.get(family.husband);
                if (father) parents.push(father);
            }
            if (family?.wife) {
                const mother = gedcomData.individuals.get(family.wife);
                if (mother) parents.push(mother);
            }
            if (pedi && pedi !== "birth") {
                if (family?.husband) parentRelations.set(family.husband, pedi);
                if (family?.wife) parentRelations.set(family.wife, pedi);
            }
        });

        // 获取配偶
        const spouseFamilies = individual.families.filter((f) => f.type === "spouse");
        const spouses: Individual[] = [];
        spouseFamilies.forEach((famConn) => {
            const family = gedcomData.families.get(famConn.id);
            if (family) {
                if (family.husband && family.husband !== focusedId) {
                    const spouse = gedcomData.individuals.get(family.husband);
                    if (spouse) spouses.push(spouse);
                }
                if (family.wife && family.wife !== focusedId) {
                    const spouse = gedcomData.individuals.get(family.wife);
                    if (spouse) spouses.push(spouse);
                }
            }
        });

        // 获取兄弟姐妹
        const siblings: Individual[] = [];
        parentFamilies.forEach((famConn) => {
            const family = gedcomData.families.get(famConn.id);
            if (family) {
                family.children.forEach((childId) => {
                    if (childId !== focusedId) {
                        const sibling = gedcomData.individuals.get(childId);
                        if (sibling) siblings.push(sibling);
                    }
                });
            }
        });

        // 获取子女
        const children: Individual[] = [];
        const childRelations = new Map<string, string>();

        // 从配偶家庭中获取子女
        spouseFamilies.forEach((famConn) => {
            const family = gedcomData.families.get(famConn.id);
            if (family) {
                family.children.forEach((childId) => {
                    const child = gedcomData.individuals.get(childId);
                    if (child) {
                        children.push(child);
                        // 检查该子女在此家庭中的关系
                        for (const cf of child.families) {
                            if (cf.type === "child" && cf.id === family.id && cf.pedi && cf.pedi !== "birth") {
                                childRelations.set(childId, cf.pedi);
                            }
                        }
                    }
                });
            }
        });

        // 从所有家庭中查找该成员作为父母的家庭，获取子女
        gedcomData.families.forEach((family) => {
            if (family.husband === focusedId || family.wife === focusedId) {
                family.children.forEach((childId) => {
                    const child = gedcomData.individuals.get(childId);
                    if (child && !children.some((c) => c.id === child.id)) {
                        children.push(child);
                        // 检查该子女在此家庭中的关系
                        for (const cf of child.families) {
                            if (cf.type === "child" && cf.id === family.id && cf.pedi && cf.pedi !== "birth") {
                                childRelations.set(childId, cf.pedi);
                            }
                        }
                    }
                });
            }
        });

        // 获取世代（使用解析时计算的绝对世代）
        const generation = individual.generation;

        return {
            individual,
            generation,
            parents,
            parentRelations,
            spouses,
            siblings,
            children,
            childRelations,
        };
    };

    // 获取节点的第一张图片URL
    const getNodeThumbnail = useCallback(
        (nodeId: string): string | null => {
            const individual = gedcomData.individuals.get(nodeId);
            if (!individual?.mediaRefs.length) return null;
            for (const ref of individual.mediaRefs) {
                const record = gedcomData.media.get(ref);
                if (record?.file) {
                    const filename = record.file.split(/[\\/]/).pop();
                    if (filename) return `/Family/${filename}`;
                }
            }
            return null;
        },
        [gedcomData],
    );

    // 用 ref 同步 position/scale，供动画 useEffect 读取最新值而不触发重新渲染
    const positionRef = useRef(position);
    positionRef.current = position;
    const scaleRef = useRef(scale);
    scaleRef.current = scale;

    // 移动端手势相关
    const initialTouchDistanceRef = useRef<number | null>(null);
    const lastTouchScaleRef = useRef(1);
    const lastTouchPositionRef = useRef({ x: 0, y: 0 });

    // 获取容器尺寸
    const getContainerRect = useCallback(() => {
        if (containerRef.current) {
            return containerRef.current.getBoundingClientRect();
        }
        return { width: 0, height: 0, left: 0, top: 0 };
    }, []);

    // 以视口中心点缩放
    const zoomAtCenter = useCallback(
        (oldScale: number, newScale: number) => {
            if (!containerRef.current) return;

            const containerRect = getContainerRect();
            const centerX = containerRect.width / 2;
            const centerY = containerRect.height / 2;

            // 计算中心点在当前缩放下的坐标
            const centerXInContent = (centerX - position.x) / oldScale;
            const centerYInContent = (centerY - position.y) / oldScale;

            // 计算新的位置，使中心点保持在同一位置
            const newX = centerX - centerXInContent * newScale;
            const newY = centerY - centerYInContent * newScale;

            setPosition({ x: newX, y: newY });
        },
        [position, getContainerRect],
    );

    const handleZoomIn = useCallback(() => {
        const newScale = Math.min(scale + 0.5, 3);
        zoomAtCenter(scale, newScale);
        setScale(newScale);
    }, [scale, zoomAtCenter]);

    const handleZoomOut = useCallback(() => {
        const newScale = Math.max(scale - 0.5, 0.2);
        zoomAtCenter(scale, newScale);
        setScale(newScale);
    }, [scale, zoomAtCenter]);

    const handleReset = useCallback(() => {
        setScale(1);
        // 以当前树的尺寸居中
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPosition({
                x: rect.width / 2 - totalWidth / 2,
                y: rect.height / 2 - totalHeight / 2,
            });
        } else {
            setPosition({ x: -3000, y: 100 });
        }
    }, [totalWidth, totalHeight]);

    // 修复：使用非被动事件监听器处理滚轮事件
    const handleWheel = useCallback(
        (e: WheelEvent) => {
            e.preventDefault();

            if (!containerRef.current) return;

            const containerRect = getContainerRect();
            const mouseX = e.clientX - containerRect.left;
            const mouseY = e.clientY - containerRect.top;

            const oldScale = scale;
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newScale = Math.max(0.2, Math.min(3, oldScale + delta));

            if (oldScale === newScale) return;

            // 计算鼠标指针在当前缩放下的坐标
            const mouseXInContent = (mouseX - position.x) / oldScale;
            const mouseYInContent = (mouseY - position.y) / oldScale;

            // 计算新的位置，使鼠标指针下的点保持不变
            const newX = mouseX - mouseXInContent * newScale;
            const newY = mouseY - mouseYInContent * newScale;

            setPosition({ x: newX, y: newY });
            setScale(newScale);
        },
        [scale, position, getContainerRect],
    );

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return; // 只响应左键
        didDragRef.current = false;
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartRef.current.x;
            const deltaY = e.clientY - dragStartRef.current.y;

            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                didDragRef.current = true;
            }

            setPosition((prev) => ({
                x: prev.x + deltaX,
                y: prev.y + deltaY,
            }));

            dragStartRef.current = { x: e.clientX, y: e.clientY };
        },
        [isDragging],
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleContainerClick = useCallback(
        (e: React.MouseEvent) => {
            if (didDragRef.current) return;
            const target = e.target as SVGElement;
            const isNodeClick = target.closest(".tree-node");
            if (!isNodeClick && focusedId) {
                setFocusedId(null);
            }
        },
        [focusedId, setFocusedId],
    );

    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // 当 focusedId 变化时（仅来自侧边栏点击），自动平滑滑动到该节点
    useEffect(() => {
        if (!focusedId || !containerRef.current) return;

        const node = nodes.find((n) => n.id === focusedId);
        if (!node) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const targetScale = 1.5;

        // 计算目标位置：将节点居中到视口
        const targetPosition = {
            x: containerRect.width / 2 - node.x * targetScale,
            y: containerRect.height / 2 - node.y * targetScale,
        };

        // 使用 ref 读取当前最新位置，避免作为依赖导致重复触发
        const startPos = { x: positionRef.current.x, y: positionRef.current.y };
        const startScale = scaleRef.current;
        const startTime = performance.now();
        const duration = 400;

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeInOutQuad
            const ease = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;

            const newPos = {
                x: startPos.x + (targetPosition.x - startPos.x) * ease,
                y: startPos.y + (targetPosition.y - startPos.y) * ease,
            };
            const newScale = startScale + (targetScale - startScale) * ease;

            setPosition(newPos);
            setScale(newScale);

            if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        setIsFocusing(true);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            setIsFocusing(false);
        };
    }, [focusedId, nodes]);

    // 当树的尺寸变化时（如过滤），自动居中
    useEffect(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPosition({
                x: rect.width / 2 - totalWidth / 2,
                y: rect.height / 2 - totalHeight / 2,
            });
        }
        setScale(1);
    }, [totalWidth, totalHeight]);

    // 移动端手势处理

    // 计算两指距离
    const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
        return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    };

    // 计算两指中点
    const getTouchMidpoint = (t1: React.Touch, t2: React.Touch) => {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
    };

    // 触摸开始
    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length === 1) {
                // 单指拖动
                didDragRef.current = false;
                setIsDragging(true);
                dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                // 双指缩放
                setIsDragging(false);
                const distance = getTouchDistance(e.touches[0], e.touches[1]);
                initialTouchDistanceRef.current = distance;
                lastTouchScaleRef.current = scale;
                lastTouchPositionRef.current = { ...position };
            }
        },
        [scale, position, getTouchDistance],
    );

    // 触摸移动
    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length === 1 && isDragging) {
                // 单指拖动
                const deltaX = e.touches[0].clientX - dragStartRef.current.x;
                const deltaY = e.touches[0].clientY - dragStartRef.current.y;

                if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                    didDragRef.current = true;
                }

                setPosition((prev) => ({
                    x: prev.x + deltaX,
                    y: prev.y + deltaY,
                }));

                dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2 && initialTouchDistanceRef.current !== null) {
                // 双指缩放
                e.preventDefault();

                const distance = getTouchDistance(e.touches[0], e.touches[1]);
                const midpoint = getTouchMidpoint(e.touches[0], e.touches[1]);
                const currentScale = lastTouchScaleRef.current * (distance / initialTouchDistanceRef.current);
                const newScale = Math.max(0.2, Math.min(3, currentScale));

                if (!containerRef.current) return;

                const containerRect = getContainerRect();
                const mouseX = midpoint.x - containerRect.left;
                const mouseY = midpoint.y - containerRect.top;

                const oldScale = lastTouchScaleRef.current;
                const oldPosition = lastTouchPositionRef.current;

                // 以两指中点为缩放中心
                const mouseXInContent = (mouseX - oldPosition.x) / oldScale;
                const mouseYInContent = (mouseY - oldPosition.y) / oldScale;

                const newX = mouseX - mouseXInContent * newScale;
                const newY = mouseY - mouseYInContent * newScale;

                setScale(newScale);
                setPosition({ x: newX, y: newY });
            }
        },
        [isDragging, getContainerRect, getTouchDistance, getTouchMidpoint],
    );

    // 触摸结束
    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length < 2) {
                initialTouchDistanceRef.current = null;
                // 同步最后的状态
                lastTouchScaleRef.current = scale;
                lastTouchPositionRef.current = position;
            }
            if (e.touches.length === 0) {
                setIsDragging(false);
            } else if (e.touches.length === 1) {
                // 从双指变为单指时重新开始拖动
                setIsDragging(true);
                dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        },
        [scale, position],
    );

    useEffect(() => {
        const transformElement = transformRef.current;
        if (!transformElement) return;

        const wheelHandler = (e: WheelEvent) => handleWheel(e);

        // 使用 { passive: false } 来确保可以调用 preventDefault
        transformElement.addEventListener("wheel", wheelHandler, { passive: false });

        return () => {
            transformElement.removeEventListener("wheel", wheelHandler);
        };
    }, [handleWheel]);

    const focusedPersonInfo = getFocusedPersonInfo();

    return (
        <div
            className="tree-view"
            ref={containerRef}
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                overflow: "hidden",
                cursor: isDragging ? "grabbing" : isFocusing ? "default" : "grab",
                touchAction: "none",
            }}
            onMouseDown={handleMouseDown}
            onClick={handleContainerClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="tree-controls"
                style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    zIndex: 10,
                }}
            >
                <button type="button" onClick={handleZoomIn}>
                    +
                </button>
                <button type="button" onClick={handleZoomOut}>
                    −
                </button>
                <button type="button" onClick={handleReset}>
                    重置
                </button>
            </div>

            {/* 聚焦成员信息面板 */}
            {focusedPersonInfo && (
                <PersonDetails
                    individual={focusedPersonInfo.individual}
                    generation={focusedPersonInfo.generation}
                    parents={focusedPersonInfo.parents}
                    parentRelations={focusedPersonInfo.parentRelations}
                    spouses={focusedPersonInfo.spouses}
                    siblings={focusedPersonInfo.siblings}
                    children={focusedPersonInfo.children}
                    childRelations={focusedPersonInfo.childRelations}
                    media={gedcomData.media}
                    onClose={() => setFocusedId(null)}
                    onPersonClick={(id) => setFocusedId(id)}
                    onPersonFocus={setFocusedId}
                    theme={theme}
                    onPhotoClick={onPhotoClick}
                />
            )}

            <div
                ref={transformRef}
                className="transform-container"
                style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: "0 0",
                    width: totalWidth * scale,
                    height: totalHeight * scale,
                }}
            >
                <svg width={totalWidth} height={totalHeight} className="tree-svg">
                    {/* Connection lines */}
                    {connections.map((conn, i) => {
                        let pathD: string;
                        if (conn.type === "spouse") {
                            pathD = `M ${conn.fromX} ${conn.fromY} L ${conn.toX} ${conn.toY}`;
                        } else if (conn.fromY !== conn.toY) {
                            const midY = (conn.fromY + conn.toY) / 2;
                            pathD = `M ${conn.fromX} ${conn.fromY} L ${conn.fromX} ${midY} L ${conn.toX} ${midY} L ${conn.toX} ${conn.toY}`;
                        } else {
                            pathD = `M ${conn.fromX} ${conn.fromY} L ${conn.toX} ${conn.toY}`;
                        }
                        return (
                            <path
                                key={i}
                                d={pathD}
                                className={`tree-line ${conn.isFoster ? "foster-line" : ""}`}
                                fill="none"
                                strokeWidth={2}
                                strokeDasharray={conn.isFoster ? "5,5" : "none"}
                            />
                        );
                    })}

                    {/* Node cards */}
                    {nodes.map((node) => {
                        const x = node.x - NODE_WIDTH / 2;
                        const y = node.y;
                        const isFocused = node.id === focusedId;
                        const thumbnail = getNodeThumbnail(node.id);
                        const THUMB_SIZE = 30;
                        const thumbX = x + 6;
                        const thumbY = y + (NODE_HEIGHT - THUMB_SIZE) / 2;
                        const textCenterX = thumbnail ? x + NODE_WIDTH / 2 + 8 : node.x;

                        return (
                            <g
                                key={node.id}
                                className={`tree-node ${isFocused ? "focused" : ""} ${node.isDeceased ? "deceased" : ""}`}
                                onClick={() => setFocusedId(node.id)}
                                style={{ cursor: "pointer" }}
                            >
                                <rect
                                    x={x}
                                    y={y}
                                    width={NODE_WIDTH}
                                    height={NODE_HEIGHT}
                                    rx={6}
                                    ry={6}
                                    className={`node-bg ${node.sex === "M" ? "male" : node.sex === "F" ? "female" : "unknown"}`}
                                />
                                {thumbnail && (
                                    <>
                                        <rect
                                            x={thumbX}
                                            y={thumbY}
                                            width={THUMB_SIZE}
                                            height={THUMB_SIZE}
                                            rx={4}
                                            ry={4}
                                            fill="var(--bg-secondary)"
                                        />
                                        <image
                                            href={thumbnail}
                                            x={thumbX}
                                            y={thumbY}
                                            width={THUMB_SIZE}
                                            height={THUMB_SIZE}
                                            preserveAspectRatio="xMidYMid slice"
                                        />
                                    </>
                                )}
                                {(() => {
                                    const formattedBirth = formatDate(node.birthDate);
                                    const birthYear = node.birthDate ? parseInt(node.birthDate, 10) : NaN;
                                    const hasBirthInfo = !!birthYear;
                                    const noteLines = node.note?.split("\n");
                                    const noteWillShow = noteLines?.[0];
                                    const showEllipsis = noteWillShow && (noteWillShow.length > 10 || noteLines?.length > 1);
                                    const note = noteWillShow
                                        ? showEllipsis
                                            ? `${noteWillShow.slice(0, 10)}…`
                                            : noteWillShow
                                        : undefined;

                                    return (
                                        <>
                                            <text
                                                x={textCenterX}
                                                y={hasBirthInfo || note ? y + 18 : y + NODE_HEIGHT / 2}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                className="node-name"
                                            >
                                                {node.name}
                                            </text>
                                            {hasBirthInfo &&
                                                (() => {
                                                    if (node.isDeceased) {
                                                        return (
                                                            <text
                                                                x={textCenterX}
                                                                y={y + 36}
                                                                textAnchor="middle"
                                                                dominantBaseline="middle"
                                                                className="node-birth"
                                                            >
                                                                {formattedBirth}
                                                            </text>
                                                        );
                                                    }
                                                    const age = new Date().getFullYear() - birthYear;
                                                    return (
                                                        <text
                                                            x={textCenterX}
                                                            y={y + 36}
                                                            textAnchor="middle"
                                                            dominantBaseline="middle"
                                                            className="node-birth"
                                                        >
                                                            {formattedBirth} · {age}岁
                                                        </text>
                                                    );
                                                })()}
                                            {note && (
                                                <text
                                                    x={textCenterX}
                                                    y={hasBirthInfo ? y + 54 : y + 36}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    className="node-note"
                                                >
                                                    {note}
                                                </text>
                                            )}
                                        </>
                                    );
                                })()}
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
