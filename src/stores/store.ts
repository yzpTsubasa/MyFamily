import { create } from "zustand";

interface ThemeStore {
    theme: string;
    setTheme: (theme: string) => void;
}

interface UiStore {
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    mobileSidebarOpen: boolean;
    setMobileSidebarOpen: (open: boolean) => void;
    expandedGenerations: number[];
    setExpandedGenerations: (generations: number[]) => void;
    toggleGeneration: (generation: number) => void;
    focusedPersonId: string | null;
    setFocusedPersonId: (id: string | null) => void;
    minGeneration: number | null;
    maxGeneration: number | null;
    rootPersonId: string | null;
    setGenerationRange: (range: {
        minGeneration: number | null;
        maxGeneration: number | null;
        rootPersonId?: string | null;
    }) => void;
    sidebarScrollTop: number;
    setSidebarScrollTop: (scrollTop: number) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
    theme: localStorage.getItem("theme") || "system",
    setTheme: (theme) => {
        localStorage.setItem("theme", theme);
        set({ theme });
    },
}));

export const useUiStore = create<UiStore>((set, get) => {
    const raw = localStorage.getItem("ui-state");
    const defaults: UiStore = {
        sidebarCollapsed: false,
        setSidebarCollapsed: () => {},
        mobileSidebarOpen: false,
        setMobileSidebarOpen: () => {},
        expandedGenerations: [1],
        setExpandedGenerations: () => {},
        toggleGeneration: () => {},
        focusedPersonId: null,
        setFocusedPersonId: () => {},
        minGeneration: null,
        maxGeneration: null,
        rootPersonId: null,
        setGenerationRange: () => {},
        sidebarScrollTop: 0,
        setSidebarScrollTop: () => {},
    };

    let initialState: {
        sidebarCollapsed: boolean;
        mobileSidebarOpen: boolean;
        expandedGenerations: number[];
        focusedPersonId: string | null;
        minGeneration: number | null;
        maxGeneration: number | null;
        rootPersonId: string | null;
        sidebarScrollTop: number;
    } = {
        sidebarCollapsed: defaults.sidebarCollapsed,
        mobileSidebarOpen: false,
        expandedGenerations: defaults.expandedGenerations,
        focusedPersonId: null,
        minGeneration: null,
        maxGeneration: null,
        rootPersonId: null,
        sidebarScrollTop: 0,
    };

    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            initialState = { ...initialState, ...parsed };
        } catch {
            // ignore
        }
    }

    const persist = () => {
        const {
            sidebarCollapsed,
            expandedGenerations,
            focusedPersonId,
            minGeneration,
            maxGeneration,
            rootPersonId,
            sidebarScrollTop,
        } = get();
        localStorage.setItem(
            "ui-state",
            JSON.stringify({
                sidebarCollapsed,
                expandedGenerations,
                focusedPersonId,
                minGeneration,
                maxGeneration,
                rootPersonId,
                sidebarScrollTop,
            }),
        );
    };

    return {
        ...initialState,
        setSidebarCollapsed: (sidebarCollapsed) => {
            set({ sidebarCollapsed });
            persist();
        },
        setMobileSidebarOpen: (mobileSidebarOpen) => {
            set({ mobileSidebarOpen });
        },
        setExpandedGenerations: (expandedGenerations) => {
            set({ expandedGenerations });
            persist();
        },
        toggleGeneration: (generation) => {
            const { expandedGenerations } = get();
            const next = expandedGenerations.includes(generation)
                ? expandedGenerations.filter((g) => g !== generation)
                : [...expandedGenerations, generation];
            set({ expandedGenerations: next });
            persist();
        },
        setFocusedPersonId: (focusedPersonId) => {
            set({ focusedPersonId });
            persist();
        },
        setGenerationRange: ({ minGeneration, maxGeneration, rootPersonId }) => {
            set({ minGeneration, maxGeneration, rootPersonId: rootPersonId ?? null });
            persist();
        },
        setSidebarScrollTop: (sidebarScrollTop) => {
            set({ sidebarScrollTop });
            persist();
        },
    };
});
