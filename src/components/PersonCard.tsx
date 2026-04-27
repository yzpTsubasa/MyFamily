/** biome-ignore-all lint/a11y/noStaticElementInteractions: sidebar items use div for click handling */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: sidebar items use div for click handling */
import type { Individual } from "../lib/gedcomParser";

interface PersonCardProps {
    person: Individual;
    isFocused: boolean;
    onClick: () => void;
    thumbnailUrl?: string | null;
}

export function PersonCard({ person, isFocused, onClick, thumbnailUrl }: PersonCardProps) {
    const displayName = person.surname
        ? `${person.surname}${person.givenName}`
        : person.name.replace(/\s*\/\/\s*$/, "");
    const sexClass = person.sex === "M" ? "male" : person.sex === "F" ? "female" : "unknown";
    const birthEvent = person.events.find((e) => e.type === "BIRT" && e.date);
    const birthYear = birthEvent ? parseInt(birthEvent.date!, 10) : undefined;
    const isDeceased = person.events.some((e) => e.type === "DEAT");
    const isAlive = !isDeceased;
    const showInfo = isAlive && birthYear && !Number.isNaN(birthYear);
    const age = showInfo ? new Date().getFullYear() - birthYear : undefined;

    return (
        <div className={`sidebar-item ${isDeceased ? "deceased" : ""} ${isFocused ? "focused" : ""}`} onClick={onClick}>
            <div className="person-info">
                <span className={`person-name sex-${sexClass}`}>{displayName}</span>
                {showInfo && age !== undefined && (
                    <span className="person-birth">{birthYear} · {age}岁</span>
                )}
            </div>
            {thumbnailUrl && (
                <img className="person-thumbnail" src={thumbnailUrl} alt="" loading="lazy" />
            )}
        </div>
    );
}
