/** biome-ignore-all lint/a11y/noStaticElementInteractions: overlay backdrop for mobile sidebar */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: overlay backdrop for mobile sidebar */
/** biome-ignore-all lint/a11y/useButtonType: buttons are not inside forms */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePreview } from "./components/ImagePreview";
import { Sidebar } from "./components/Sidebar";
import { TreeView } from "./components/TreeView";
import { type GedcomData, GedcomParser } from "./lib/gedcomParser";
import { buildFilteredTreeLayout, buildTreeLayout, type TreeLayout } from "./lib/treeBuilder";
import { useThemeStore, useUiStore } from "./stores/store";
import "./App.css";

interface ImagePreviewData {
    urls: string[];
    filenames: string[];
    initialIndex: number;
}

function App() {
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);
    const focusedId = useUiStore((s) => s.focusedPersonId);
    const setFocusedId = useUiStore((s) => s.setFocusedPersonId);
    const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
    const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
    const minGeneration = useUiStore((s) => s.minGeneration);
    const maxGeneration = useUiStore((s) => s.maxGeneration);
    const rootPersonId = useUiStore((s) => s.rootPersonId);
    const [gedcomData, setGedcomData] = useState<GedcomData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const applyTheme = (themeValue: string) => {
            if (themeValue === "system") {
                document.body.removeAttribute("data-theme");
            } else {
                document.body.setAttribute("data-theme", themeValue);
            }
        };

        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        fetch("/Family.ged")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load Family.ged");
                return res.text();
            })
            .then((text) => {
                const parser = new GedcomParser(text);
                const data = parser.parse();
                setGedcomData(data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    // 当世代范围变化时，重新构建树布局
    const treeLayout: TreeLayout | null = useMemo(() => {
        if (!gedcomData) return null;

        // 有根节点时，以该成员为根节点显示后代树
        if (rootPersonId) {
            return buildTreeLayout(gedcomData, rootPersonId);
        }

        const minD = minGeneration ? minGeneration - 1 : 0;
        const maxD = maxGeneration ? maxGeneration - 1 : Infinity;

        // 如果没有过滤，构建完整树
        if (minD === 0 && maxD === Infinity) {
            return buildTreeLayout(gedcomData, "@I0@");
        }

        // 有过滤时，使用带深度过滤的树布局
        return buildFilteredTreeLayout(gedcomData, "@I0@", minD, maxD);
    }, [gedcomData, minGeneration, maxGeneration, rootPersonId]);

    const [previewData, setPreviewData] = useState<ImagePreviewData | null>(null);
    const openPhotoPreview = useCallback((urls: string[], index: number, filenames: string[]) => {
        setPreviewData({ urls, filenames, initialIndex: index });
    }, []);

    if (loading) {
        return (
            <div className="loading">
                <p>加载族谱数据...</p>
            </div>
        );
    }

    if (error || !gedcomData || !treeLayout) {
        return (
            <div className="error">
                <p>加载失败: {error}</p>
            </div>
        );
    }

    const nodeIds = new Set(treeLayout.nodes.map((n) => n.id));
    const individuals = Array.from(gedcomData.individuals.values()).filter((ind) => nodeIds.has(ind.id));

    return (
        <div className="app">
            {mobileSidebarOpen && <div className="sidebar-overlay" onClick={() => setMobileSidebarOpen(false)} />}
            <Sidebar
                individuals={individuals}
                focusedId={focusedId}
                onPersonClick={setFocusedId}
                theme={theme}
                onThemeChange={(e) => setTheme(e.target.value)}
                media={gedcomData.media}
            />
            <button
                className="mobile-menu-btn"
                onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                aria-label="菜单"
            >
                {mobileSidebarOpen ? "→" : "☰"}
            </button>
            <main className="main-content">
                <TreeView
                    nodes={treeLayout.nodes}
                    connections={treeLayout.connections}
                    focusedId={focusedId}
                    setFocusedId={setFocusedId}
                    totalWidth={treeLayout.totalWidth}
                    totalHeight={treeLayout.totalHeight}
                    gedcomData={gedcomData}
                    theme={theme}
                    onPhotoClick={openPhotoPreview}
                />
            </main>
            {previewData && (
                <ImagePreview
                    urls={previewData.urls}
                    filenames={previewData.filenames}
                    initialIndex={previewData.initialIndex}
                    onClose={() => setPreviewData(null)}
                />
            )}
        </div>
    );
}

export default App;
