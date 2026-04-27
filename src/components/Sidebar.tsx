/** biome-ignore-all lint/a11y/noStaticElementInteractions: interactive divs styled as UI controls */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: interactive divs styled as UI controls */
/** biome-ignore-all lint/a11y/useButtonType: buttons are not inside forms */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: stable refs used in hooks */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Individual, MediaRecord } from "../lib/gedcomParser";
import { useUiStore } from "../stores/store";
import { PersonCard } from "./PersonCard";

interface SidebarProps {
    individuals: Individual[];
    focusedId: string | null;
    onPersonClick: (id: string) => void;
    theme: string;
    onThemeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    media: Map<string, MediaRecord>;
}

function getFirstThumbnail(individual: Individual, media: Map<string, MediaRecord>): string | null {
    for (const ref of individual.mediaRefs) {
        const record = media.get(ref);
        if (record?.file) {
            const filename = record.file.split(/[\\/]/).pop();
            if (filename) return `/Family/${filename}`;
        }
    }
    return null;
}

export function Sidebar({ individuals, focusedId, onPersonClick, theme, onThemeChange, media }: SidebarProps) {
    const [search, setSearch] = useState("");
    const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
    const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
    const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
    const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
    const expandedGenerationsList = useUiStore((s) => s.expandedGenerations);
    const expandedGenerations = useMemo(() => new Set(expandedGenerationsList), [expandedGenerationsList]);
    const toggleGeneration = useUiStore((s) => s.toggleGeneration);
    const setExpandedGenerations = useUiStore((s) => s.setExpandedGenerations);
    const setSidebarScrollTop = useUiStore((s) => s.setSidebarScrollTop);
    const sidebarScrollTop = useUiStore((s) => s.sidebarScrollTop);
    const listRef = useRef<HTMLDivElement | null>(null);

    // 恢复滚动位置
    useEffect(() => {
        if (listRef.current && sidebarScrollTop > 0) {
            listRef.current.scrollTop = sidebarScrollTop;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const savedStateBeforeSearchRef = useRef<number[] | null>(null);
    const prevSearchRef = useRef("");
    const personRefs = useRef<Map<string, HTMLElement | null>>(new Map());

    const filtered = useMemo(() => {
        if (!search.trim()) return individuals;
        const q = search.toLowerCase();
        return individuals.filter((p) => {
            const cleanName = p.name.replace(/\s*\/\/\s*$/, "").toLowerCase();
            const cleanGiven = p.givenName.toLowerCase();
            return cleanName.includes(q) || cleanGiven.includes(q) || p.id.toLowerCase().includes(q);
        });
    }, [individuals, search]);

    const generationGroups = useMemo(() => {
        const groups = new Map<number, Individual[]>();
        filtered.forEach((individual) => {
            const generation = individual.generation;
            if (!groups.has(generation)) {
                groups.set(generation, []);
            }
            groups.get(generation)?.push(individual);
        });
        return Array.from(groups.entries())
            .map(([generation, individuals]) => ({
                generation,
                individuals,
            }))
            .sort((a, b) => a.generation - b.generation);
    }, [filtered]);

    // 当搜索变化时，自动展开包含搜索结果的世代
    useEffect(() => {
        if (search !== prevSearchRef.current) {
            if (search.trim()) {
                if (savedStateBeforeSearchRef.current === null) {
                    savedStateBeforeSearchRef.current = useUiStore.getState().expandedGenerations;
                }

                const generationsToExpand = new Set<number>();
                generationGroups.forEach((group) => {
                    if (group.individuals.length > 0) {
                        generationsToExpand.add(group.generation);
                    }
                });
                setExpandedGenerations(Array.from(generationsToExpand));
            } else {
                if (savedStateBeforeSearchRef.current !== null) {
                    setExpandedGenerations(savedStateBeforeSearchRef.current);
                    savedStateBeforeSearchRef.current = null;
                }
            }

            prevSearchRef.current = search;
        }
    }, [search, generationGroups, setExpandedGenerations]);

    // 当聚焦成员变化时，自动展开该成员所在的世代分组并滚动到该成员
    const prevFocusedIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (focusedId && focusedId !== prevFocusedIdRef.current) {
            prevFocusedIdRef.current = focusedId;
            const focusedPerson = individuals.find((person) => person.id === focusedId);
            if (focusedPerson) {
                const focusedGeneration = focusedPerson.generation;
                const current = useUiStore.getState().expandedGenerations;
                if (!current.includes(focusedGeneration)) {
                    setExpandedGenerations([...current, focusedGeneration]);
                }

                setTimeout(() => {
                    const personElement = personRefs.current.get(focusedId);
                    if (personElement) {
                        personElement.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }, 100);
            }
        }
    }, [focusedId, individuals, setExpandedGenerations]);

    const handleExpandAll = (shouldExpandAll: boolean) => {
        if (shouldExpandAll) {
            const allGenerations = generationGroups.map((g) => g.generation);
            setExpandedGenerations(allGenerations);
        } else {
            setExpandedGenerations([]);
        }
    };

    const allExpanded =
        generationGroups.length > 0 && generationGroups.every((group) => expandedGenerations.has(group.generation));
    const expandAllText = allExpanded ? "全部折叠" : "全部展开";
    const expandAllIcon = allExpanded ? "📁" : "📂";

    return (
        <div className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileSidebarOpen ? "mobile-open" : ""}`}>
            <div className="sidebar-header">
                {!(sidebarCollapsed && !mobileSidebarOpen) && <h2>族谱成员</h2>}
                <button
                    className="collapse-btn"
                    onClick={() => {
                        if (mobileSidebarOpen) {
                            setMobileSidebarOpen(false);
                        } else {
                            setSidebarCollapsed(!sidebarCollapsed);
                        }
                    }}
                >
                    {mobileSidebarOpen ? "×" : sidebarCollapsed ? "→" : "←"}
                </button>
            </div>
            {!(sidebarCollapsed && !mobileSidebarOpen) && (
                <>
                    <div className="theme-selector">
                        <div className="theme-toggle-group">
                            <button
                                className={`theme-toggle ${theme === "system" ? "active" : ""}`}
                                onClick={() =>
                                    onThemeChange({
                                        target: { value: "system" },
                                    } as React.ChangeEvent<HTMLSelectElement>)
                                }
                                title="跟随系统"
                            >
                                <span className="theme-icon">🌓</span>
                                <span className="theme-text">系统</span>
                            </button>
                            <button
                                className={`theme-toggle ${theme === "light" ? "active" : ""}`}
                                onClick={() =>
                                    onThemeChange({
                                        target: { value: "light" },
                                    } as React.ChangeEvent<HTMLSelectElement>)
                                }
                                title="浅色模式"
                            >
                                <span className="theme-icon">☀️</span>
                                <span className="theme-text">浅色</span>
                            </button>
                            <button
                                className={`theme-toggle ${theme === "dark" ? "active" : ""}`}
                                onClick={() =>
                                    onThemeChange({ target: { value: "dark" } } as React.ChangeEvent<HTMLSelectElement>)
                                }
                                title="深色模式"
                            >
                                <span className="theme-icon">🌙</span>
                                <span className="theme-text">深色</span>
                            </button>
                        </div>
                    </div>
                    <div className="sidebar-search">
                        <input
                            type="text"
                            placeholder="搜索姓名..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="sidebar-controls">
                        <button
                            className="control-btn"
                            onClick={() => handleExpandAll(!allExpanded)}
                            title={expandAllText}
                        >
                            <span className="control-icon">{expandAllIcon}</span>
                            {expandAllText}
                        </button>
                    </div>
                    <div
                        className="sidebar-list"
                        ref={listRef}
                        onScroll={() => {
                            if (listRef.current) {
                                setSidebarScrollTop(listRef.current.scrollTop);
                            }
                        }}
                    >
                        <span className="sidebar-count">共 {filtered.length} 人</span>
                        {generationGroups.map((group) => (
                            <div key={group.generation} className="generation-group">
                                <div className="generation-header" onClick={() => toggleGeneration(group.generation)}>
                                    <span className="generation-icon">
                                        {expandedGenerations.has(group.generation) ? "▼" : "▶"}
                                    </span>
                                    <span className="generation-title">
                                        第 {group.generation} 世 ({group.individuals.length}人)
                                    </span>
                                </div>
                                {expandedGenerations.has(group.generation) && (
                                    <div className="generation-members">
                                        {group.individuals.map((person) => (
                                            <div
                                                key={person.id}
                                                ref={(el) => {
                                                    personRefs.current.set(person.id, el);
                                                }}
                                            >
                                                <PersonCard
                                                    person={person}
                                                    isFocused={person.id === focusedId}
                                                    thumbnailUrl={getFirstThumbnail(person, media)}
                                                    onClick={() => {
                                                        onPersonClick(person.id);
                                                        if (mobileSidebarOpen) {
                                                            setMobileSidebarOpen(false);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
