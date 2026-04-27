/** biome-ignore-all lint/a11y/noStaticElementInteractions: clickable list items for navigation */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: clickable list items for navigation */
/** biome-ignore-all lint/a11y/useButtonType: buttons are not inside forms */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: items are ordered and do not reorder */

import { useCallback, useEffect, useRef } from "react";
import { formatDate } from "../lib/dateFormatter";
import type { Individual, MediaRecord } from "../lib/gedcomParser";
import { useUiStore } from "../stores/store";

interface PersonDetailsProps {
    individual: Individual;
    generation: number;
    parents: Individual[];
    parentRelations: Map<string, string>;
    spouses: Individual[];
    siblings: Individual[];
    children: Individual[];
    childRelations: Map<string, string>;
    media: Map<string, MediaRecord>;
    onClose: () => void;
    onPersonClick: (id: string) => void;
    onPersonFocus: (id: string) => void;
    theme: string;
    onPhotoClick?: (urls: string[], index: number, filenames: string[]) => void;
}

const pediLabel = (pedi: string): string => {
    if (pedi === "foster") return "继";
    if (pedi === "adopted") return "收";
    // if (pedi === "sealing")
    return "";
};

export { ImagePreview, type ImagePreviewProps } from "./ImagePreview";

export function PersonDetails({
    individual,
    generation,
    parents,
    parentRelations,
    spouses,
    siblings,
    children,
    childRelations,
    media,
    onClose,
    onPersonClick,
    onPersonFocus,
    theme,
    onPhotoClick,
}: PersonDetailsProps) {
    // Resolve image URLs from media references
    const imageInfos: { url: string; filename: string }[] = [];
    for (const ref of individual.mediaRefs) {
        const record = media.get(ref);
        if (record?.file) {
            const filename = record.file.split(/[\\/]/).pop();
            if (filename) {
                imageInfos.push({ url: `/Family/${filename}`, filename });
            }
        }
    }

    // Prevent scroll events from propagating to the tree view underneath
    const detailsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = detailsRef.current;
        if (!el) return;
        const preventScrollPropagation = (e: Event) => {
            const target = e.target as HTMLElement;
            // Only prevent if the scroll is inside this element
            if (el.contains(target)) {
                e.stopPropagation();
            }
        };
        el.addEventListener("wheel", preventScrollPropagation, { passive: false });
        el.addEventListener("touchmove", preventScrollPropagation, { passive: false });
        return () => {
            el.removeEventListener("wheel", preventScrollPropagation);
            el.removeEventListener("touchmove", preventScrollPropagation);
        };
    }, []);

    // Photos for display
    const photoUrls = imageInfos.map((info) => info.url);
    const photoFilenames = imageInfos.map((info) => info.filename);

    return (
        <div ref={detailsRef} className="person-details" onClick={(e) => e.stopPropagation()}>
            <div className="person-details-header">
                <h3>成员详情</h3>
                <button type="button" className="close-button" onClick={onClose}>
                    ×
                </button>
            </div>

            <div className="person-details-body">
                <div className="person-basic-info">
                    <p className={`person-name sex-${individual.sex === "M" ? "male" : individual.sex === "F" ? "female" : "unknown"}`}>
                        {individual.surname
                            ? `${individual.surname}${individual.givenName}`
                            : individual.name.replace(/\s*\/\/\s*$/, "")}
                    </p>
                    <p className="person-meta">第 {generation} 世</p>
                    {(() => {
                        const birthEvent = individual.events.find((e) => e.type === "BIRT" && e.date);
                        const deathEvent = individual.events.find((e) => e.type === "DEAT");
                        const deathDateEvent = individual.events.find((e) => e.type === "DEAT" && e.date);
                        const parts: string[] = [];
                        if (birthEvent) {
                            const formatted = formatDate(birthEvent.date);
                            if (formatted) {
                                const birthYear = parseInt(birthEvent.date!, 10);
                                const currentYear = new Date().getFullYear();
                                if (!Number.isNaN(birthYear)) {
                                    const age = currentYear - birthYear;
                                    parts.push(`生: ${formatted} (${deathEvent ? "已故" : `${age}岁`})`);
                                }
                            }
                        }
                        if (deathDateEvent) {
                            const formatted = formatDate(deathDateEvent.date);
                            if (formatted) {
                                parts.push(`卒 ${formatted}`);
                            }
                        }
                        if (parts.length === 0) return null;
                        return (
                            <>
                                {parts.map((p, i) => (
                                    <p key={i} className="person-meta">
                                        {p}
                                    </p>
                                ))}
                            </>
                        );
                    })()}
                </div>

                {/* 世代过滤 */}
                <div className="generation-filter-bar">
                    <button
                        className="generation-filter-btn"
                        onClick={() => {
                            useUiStore.getState().setGenerationRange({
                                minGeneration: 1,
                                maxGeneration: generation,
                                rootPersonId: null,
                            });
                        }}
                    >
                        仅显示先祖
                    </button>
                    <button
                        className="generation-filter-btn"
                        onClick={() => {
                            useUiStore.getState().setGenerationRange({
                                minGeneration: null,
                                maxGeneration: null,
                                rootPersonId: individual.id,
                            });
                        }}
                    >
                        仅显示后代
                    </button>
                    <button
                        className="generation-filter-btn"
                        onClick={() => {
                            useUiStore.getState().setGenerationRange({
                                minGeneration: null,
                                maxGeneration: null,
                                rootPersonId: null,
                            });
                        }}
                    >
                        显示全部
                    </button>
                </div>

                {/* 附注 */}
                {individual.notes.length > 0 && (
                    <div className="person-relation-section">
                        <h4>附注</h4>
                        {individual.notes.map((note, i) => (
                            <p key={i} className="person-note">
                                {note}
                            </p>
                        ))}
                    </div>
                )}

                {/* 照片缩略列表 */}
                {photoUrls.length > 0 && (
                    <div className="person-photo-section">
                        <h4>照片</h4>
                        <div className="person-photo-scroll">
                            {photoUrls.map((url, i) => (
                                <img
                                    key={i}
                                    className="person-photo-thumb"
                                    src={url}
                                    alt={individual.name}
                                    onClick={() => onPhotoClick?.(photoUrls, i, photoFilenames)}
                                />
                            ))}
                        </div>
                    </div>
                )}
                {/* 父母信息 */}
                {parents.length > 0 && (
                    <div className="person-relation-section">
                        <h4>父母</h4>
                        <ul className="person-relation-list">
                            {parents.map((parent) => {
                                const pedi = parentRelations.get(parent.id);
                                return (
                                    <li
                                        key={parent.id}
                                        className={`person-relation-item sex-${parent.sex === "M" ? "male" : parent.sex === "F" ? "female" : "unknown"}`}
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            onPersonClick(parent.id);
                                            onPersonFocus(parent.id);
                                        }}
                                    >
                                        {parent.surname
                                            ? `${parent.surname}${parent.givenName}`
                                            : parent.name.replace(/\s*\/\/\s*$/, "")}
                                        {pedi && <span className="person-relation-badge">{pediLabel(pedi)}</span>}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {/* 配偶信息 */}
                {spouses.length > 0 && (
                    <div className="person-relation-section">
                        <h4>配偶</h4>
                        <ul className="person-relation-list">
                            {spouses.map((spouse) => (
                                <li
                                    key={spouse.id}
                                    className={`person-relation-item sex-${spouse.sex === "M" ? "male" : spouse.sex === "F" ? "female" : "unknown"}`}
                                    onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onPersonClick(spouse.id);
                                        onPersonFocus(spouse.id);
                                    }}
                                >
                                    {spouse.surname
                                        ? `${spouse.surname}${spouse.givenName}`
                                        : spouse.name.replace(/\s*\/\/\s*$/, "")}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* 兄弟姐妹信息 */}
                {siblings.length > 0 && (
                    <div className="person-relation-section">
                        <h4>兄弟姐妹</h4>
                        <ul className="person-relation-list">
                            {siblings.map((sibling) => (
                                <li
                                    key={sibling.id}
                                    className={`person-relation-item sex-${sibling.sex === "M" ? "male" : sibling.sex === "F" ? "female" : "unknown"}`}
                                    onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onPersonClick(sibling.id);
                                        onPersonFocus(sibling.id);
                                    }}
                                >
                                    {sibling.surname
                                        ? `${sibling.surname}${sibling.givenName}`
                                        : sibling.name.replace(/\s*\/\/\s*$/, "")}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* 子女信息 */}
                {children.length > 0 && (
                    <div className="person-relation-section">
                        <h4>子女</h4>
                        <ul className="person-relation-list">
                            {children.map((child) => {
                                const pedi = childRelations.get(child.id);
                                return (
                                    <li
                                        key={child.id}
                                        className={`person-relation-item sex-${child.sex === "M" ? "male" : child.sex === "F" ? "female" : "unknown"}`}
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            onPersonClick(child.id);
                                            onPersonFocus(child.id);
                                        }}
                                    >
                                        {child.surname
                                            ? `${child.surname}${child.givenName}`
                                            : child.name.replace(/\s*\/\/\s*$/, "")}
                                        {pedi && <span className="person-relation-badge">{pediLabel(pedi)}</span>}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
