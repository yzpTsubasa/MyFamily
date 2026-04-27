/** biome-ignore-all lint/a11y/noStaticElementInteractions: overlay backdrop for image preview */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: overlay backdrop for image preview */

import exifr from "exifr";
import gcoord from "gcoord";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ImagePreviewProps {
    urls: string[];
    filenames: string[];
    initialIndex: number;
    onClose: () => void;
}

export function ImagePreview({ urls, filenames, initialIndex, onClose }: ImagePreviewProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [animState, setAnimState] = useState<{ prev: number; direction: "left" | "right" } | null>(null);
    const [showExif, setShowExif] = useState(true);
    type ExifItem = { label: string; value: string; href?: string };
    const [exifItems, setExifItems] = useState<ExifItem[]>([]);
    const [exifLoading, setExifLoading] = useState(false);

    // Zoom state
    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    // Reset zoom when image changes
    useEffect(() => {
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
    }, [currentIndex]);

    // Zoom to a point (wheel or pinch)
    const zoomTo = useCallback((delta: number, clientX: number, clientY: number) => {
        const container = containerRef.current;
        const img = imgRef.current;
        if (!container || !img) return;

        const rect = container.getBoundingClientRect();
        // Point relative to container center
        const px = clientX - rect.left - rect.width / 2;
        const py = clientY - rect.top - rect.height / 2;

        setScale((prev) => {
            const next = Math.min(Math.max(prev + delta, 0.5), 10);
            if (next <= 1) {
                // Snap back to center
                setTranslateX(0);
                setTranslateY(0);
            } else {
                // Adjust translation to zoom toward the cursor point
                const scaleRatio = next / prev;
                setTranslateX((tx) => px - scaleRatio * (px - tx));
                setTranslateY((ty) => py - scaleRatio * (py - ty));
            }
            return next;
        });
    }, []);

    // Wheel zoom — registered below as non-passive DOM listener
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.002;
        zoomTo(delta, e.clientX, e.clientY);
    }, [zoomTo]);

    // Double-click zoom
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if (scale > 1) {
            setScale(1);
            setTranslateX(0);
            setTranslateY(0);
        } else {
            setScale(3);
            setTranslateX(e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0) - (containerRef.current?.getBoundingClientRect().width ?? 0) / 2);
            setTranslateY(e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0) - (containerRef.current?.getBoundingClientRect().height ?? 0) / 2);
        }
    }, [scale]);

    // Pan when zoomed in (mouse drag)
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

    // Mouse drag to switch images (when not zoomed)
    const isSwitchingRef = useRef(false);
    const switchStartRef = useRef({ x: 0, y: 0 });

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale <= 1) {
            // Start drag-to-switch
            isSwitchingRef.current = true;
            switchStartRef.current = { x: e.clientX, y: e.clientY };
        } else {
            // Start pan when zoomed
            isPanningRef.current = true;
            panStartRef.current = { x: e.clientX, y: e.clientY, tx: translateX, ty: translateY };
        }
    }, [scale, translateX, translateY]);

    const navigate = useCallback(
        (direction: "left" | "right") => {
            if (animState !== null || urls.length <= 1) return;
            const next = direction === "right"
                ? (currentIndex + 1) % urls.length
                : (currentIndex - 1 + urls.length) % urls.length;
            setAnimState({ prev: currentIndex, direction });
            setCurrentIndex(next);
        },
        [animState, currentIndex, urls.length]
    );

    const goNext = useCallback(() => navigate("right"), [navigate]);
    const goPrev = useCallback(() => navigate("left"), [navigate]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isPanningRef.current) {
                const { x, y, tx, ty } = panStartRef.current;
                setTranslateX(tx + (e.clientX - x));
                setTranslateY(ty + (e.clientY - y));
            }
        };
        const handleMouseUp = (e: MouseEvent) => {
            if (isSwitchingRef.current && urls.length > 1) {
                const dx = e.clientX - switchStartRef.current.x;
                const dy = e.clientY - switchStartRef.current.y;
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                    if (dx > 0) goPrev();
                    else goNext();
                }
            }
            isPanningRef.current = false;
            isSwitchingRef.current = false;
        };
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [goNext, goPrev, urls.length]);

    // Pinch-to-zoom (touch)
    const touchStartXRef = useRef<number | null>(null);
    const touchStartYRef = useRef<number | null>(null);
    const touchDistanceRef = useRef<number | null>(null);
    const touchScaleStartRef = useRef<number>(1);
    const touchTxStartRef = useRef<number>(0);
    const touchTyStartRef = useRef<number>(0);
    const touchPxStartRef = useRef<number>(0); // pinch center relative to container center at touch start
    const touchPyStartRef = useRef<number>(0);

    const getTouchDistance = (t1: Touch, t2: Touch) => {
        return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    };

    // Register non-passive touch listener for pinch-to-zoom
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                const dist = getTouchDistance(e.touches[0], e.touches[1]);
                touchDistanceRef.current = dist;
                touchScaleStartRef.current = scale;
                touchTxStartRef.current = translateX;
                touchTyStartRef.current = translateY;
                const rect = el.getBoundingClientRect();
                const pinchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const pinchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                touchPxStartRef.current = pinchX - rect.left - rect.width / 2;
                touchPyStartRef.current = pinchY - rect.top - rect.height / 2;
            } else if (e.touches.length === 1) {
                touchStartXRef.current = e.touches[0].clientX;
                touchStartYRef.current = e.touches[0].clientY;
                touchTxStartRef.current = translateX;
                touchTyStartRef.current = translateY;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && touchDistanceRef.current !== null) {
                e.preventDefault();
                const dist = getTouchDistance(e.touches[0], e.touches[1]);
                const scaleRatio = dist / touchDistanceRef.current;
                const newScale = Math.max(0.5, Math.min(10, touchScaleStartRef.current * scaleRatio));

                if (newScale <= 1) {
                    setTranslateX(0);
                    setTranslateY(0);
                } else {
                    // Same formula as wheel zoom: px - scaleRatio * (px - tx)
                    setTranslateX(touchPxStartRef.current - scaleRatio * (touchPxStartRef.current - touchTxStartRef.current));
                    setTranslateY(touchPyStartRef.current - scaleRatio * (touchPyStartRef.current - touchTyStartRef.current));
                }
                setScale(newScale);
            } else if (e.touches.length === 1 && scale > 1 && touchStartXRef.current !== null && touchStartYRef.current !== null) {
                const dx = e.touches[0].clientX - touchStartXRef.current;
                const dy = e.touches[0].clientY - touchStartYRef.current;
                setTranslateX((_tx) => touchTxStartRef.current + dx);
                setTranslateY((_ty) => touchTyStartRef.current + dy);
            }
        };

        const onTouchEnd = (e: TouchEvent) => {
            if (e.touches.length < 2) {
                touchDistanceRef.current = null;
            }
            if (e.touches.length === 0) {
                if (touchStartXRef.current !== null && scale <= 1 && urls.length > 1) {
                    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
                    if (Math.abs(dx) > 50) {
                        if (dx > 0) goPrev();
                        else goNext();
                    }
                }
                touchStartXRef.current = null;
                touchStartYRef.current = null;
                touchTxStartRef.current = 0;
                touchTyStartRef.current = 0;
                touchPxStartRef.current = 0;
                touchPyStartRef.current = 0;
            } else if (e.touches.length === 1) {
                // From two fingers to one: restart drag with current touch
                touchStartXRef.current = e.touches[0].clientX;
                touchStartYRef.current = e.touches[0].clientY;
                touchTxStartRef.current = translateX;
                touchTyStartRef.current = translateY;
            }
        };

        el.addEventListener("touchstart", onTouchStart, { passive: true });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd);
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("touchend", onTouchEnd);
            el.removeEventListener("wheel", handleWheel);
        };
    }, [scale, translateX, translateY, goNext, goPrev, handleWheel]);

    const handleAnimEnd = () => {
        setAnimState(null);
    };

    // Load EXIF when panel is shown or image changes
    useEffect(() => {
        if (!showExif) return;
        setExifLoading(true);
        setExifItems([]);

        let cancelled = false;
        exifr.parse(`/Family/${filenames[currentIndex]}`, { gps: true })
            .then((data) => {
                if (cancelled) return;
                const items: ExifItem[] = [];
                if (data?.DateTimeOriginal) {
                    items.push({ label: "拍摄时间", value: new Date(data.DateTimeOriginal).toLocaleString("zh-CN") });
                }
                if (data?.Make || data?.Model) {
                    items.push({ label: "设备", value: [data.Make, data.Model].filter(Boolean).join(" ") });
                }
                if (data?.latitude != null && data?.longitude != null) {
                    const result = gcoord.transform([data.longitude, data.latitude], gcoord.WGS84, gcoord.GCJ02);
                    let coordStr = `${result[1].toFixed(6)}, ${result[0].toFixed(6)}`;
                    if (data?.GPSAltitude != null) {
                        coordStr += ` (${Math.round(data.GPSAltitude)}m)`;
                    }
                    items.push({
                        label: "位置",
                        value: coordStr,
                        href: `https://uri.amap.com/marker?position=${result[0]},${result[1]}`,
                    });
                }
                if (data?.FNumber) items.push({ label: "光圈", value: `f/${data.FNumber}` });
                if (data?.ExposureTime) items.push({ label: "快门", value: `1/${Math.round(1 / data.ExposureTime)}s` });
                if (data?.ISO) items.push({ label: "ISO", value: String(data.ISO) });
                if (data?.FocalLength) items.push({ label: "焦距", value: `${data.FocalLength}mm` });
                if (data?.ExifImageHeight) items.push({ label: "尺寸", value: `${data.ExifImageWidth}×${data.ExifImageHeight}` });
                setExifItems(items);
            })
            .catch(() => {
                // No EXIF data
            })
            .finally(() => {
                if (!cancelled) setExifLoading(false);
            });

        return () => { cancelled = true; };
    }, [showExif, currentIndex, filenames]);

    // 键盘操作
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight") goNext();
            if (e.key === "ArrowLeft") goPrev();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose, goNext, goPrev]);

    const displayIndex = currentIndex;

    return (
        <div className="image-preview-overlay" onClick={onClose}>
            <button type="button" className="image-preview-close" onClick={onClose}>
                ×
            </button>
            <div className="image-preview-container" onClick={(e) => e.stopPropagation()}>
                <div
                    ref={containerRef}
                    className="image-preview-touch-area"
                    onDoubleClick={handleDoubleClick}
                    onMouseDown={handleMouseDown}
                >
                    <div className="image-preview-carousel">
                        {/* Current/entering image */}
                        <div
                            key={currentIndex}
                            className={`image-preview-slide image-preview-slide--current${animState ? ` image-preview-slide--enter image-preview-slide--enter-${animState.direction === "right" ? "from-right" : "from-left"}` : ""}`}
                        >
                            <img
                                ref={imgRef}
                                className="image-preview-img"
                                src={urls[currentIndex]}
                                alt={`照片 ${currentIndex + 1}`}
                                style={scale !== 1 ? {
                                    transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                                } : undefined}
                            />
                        </div>
                        {/* Previous/exiting image (only during transition) */}
                        {animState && (
                            <div
                                key={`exit-${animState.prev}`}
                                className={`image-preview-slide image-preview-slide--exit image-preview-slide--exit-${animState.direction === "right" ? "to-left" : "to-right"}`}
                                onAnimationEnd={handleAnimEnd}
                            >
                                <img
                                    className="image-preview-img"
                                    src={urls[animState.prev]}
                                    alt=""
                                />
                            </div>
                        )}
                    </div>
                </div>
                {urls.length > 1 && (
                    <>
                        <button
                            type="button"
                            className="image-preview-nav image-preview-prev"
                            onClick={(e) => {
                                e.stopPropagation();
                                goPrev();
                            }}
                        >
                            ‹
                        </button>
                        <button
                            type="button"
                            className="image-preview-nav image-preview-next"
                            onClick={(e) => {
                                e.stopPropagation();
                                goNext();
                            }}
                        >
                            ›
                        </button>
                    </>
                )}
                {/* 页码计数器 — 始终在顶层，画面顶部 */}
                {urls.length > 1 && (
                    <div className="image-preview-counter">
                        {displayIndex + 1} / {urls.length}
                    </div>
                )}

                {/* EXIF 信息面板 */}
                <div className="image-preview-exif">
                    <button
                        type="button"
                        className="image-preview-exif-toggle"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowExif(!showExif);
                        }}
                    >
                        {showExif ? "收起信息" : "查看信息"}
                    </button>
                    {showExif && (
                        <div className="image-preview-exif-panel">
                            {exifLoading ? (
                                <span className="image-preview-exif-loading">加载中...</span>
                            ) : exifItems.length > 0 ? (
                                <dl className="image-preview-exif-list">
                                    {exifItems.map((item) => (
                                        <div key={item.label} className="image-preview-exif-item">
                                            <dt>{item.label}</dt>
                                            <dd>
                                                {item.href ? (
                                                    <a href={item.href} target="_blank" rel="noopener noreferrer">
                                                        {item.value}
                                                    </a>
                                                ) : (
                                                    item.value
                                                )}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            ) : (
                                <span className="image-preview-exif-empty">无EXIF信息</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
