export interface GedcomNode {
    level: number;
    tag: string;
    data?: string;
    pointer?: string;
    children: GedcomNode[];
}

export interface GedcomRecord {
    type: string;
    id: string;
    pointers: Set<string>;
    nodes: GedcomNode[];
}

export interface Individual {
    id: string;
    name: string;
    givenName: string;
    surname?: string;
    sex: "M" | "F" | "U";
    families: FamilyConnection[];
    events: Event[];
    attributes: Attribute[];
    mediaRefs: string[];
    notes: string[];
    generation: number;
    _uid?: string;
    chan?: { date: string; time?: string };
}

export interface Family {
    id: string;
    husband?: string;
    wife?: string;
    children: string[];
    marriage?: Event;
    events: Event[];
    _mstat?: string;
}

export interface FamilyConnection {
    id: string;
    type: "spouse" | "child";
    pedi?: string;
}

export interface Event {
    type: string;
    date?: string;
    time?: string;
    place?: string;
    _uid?: string;
    [key: string]: unknown;
}

export interface Attribute {
    type: string;
    value: string;
    _uid?: string;
    [key: string]: unknown;
}

export interface MediaRecord {
    id: string;
    file: string;
    format?: string;
}

export interface GedcomData {
    header: GedcomRecord;
    records: Map<string, GedcomRecord>;
    individuals: Map<string, Individual>;
    families: Map<string, Family>;
    submissions: Map<string, Submission>;
    media: Map<string, MediaRecord>;
    errors: string[];
}

export interface Submission {
    id: string;
    name: string;
    [key: string]: unknown;
}

export class GedcomParser {
    private lines: string[];
    private currentIndex: number = 0;
    private data: GedcomData = {
        header: { type: "HEAD", id: "HEAD", pointers: new Set(), nodes: [] },
        records: new Map(),
        individuals: new Map(),
        families: new Map(),
        submissions: new Map(),
        media: new Map(),
        errors: [],
    };

    constructor(gedcomContent: string) {
        const cleanContent = gedcomContent.replace(/^﻿/, "").replace(/\r/g, "");
        this.lines = cleanContent.split("\n").filter((line) => line.trim());
    }

    parse(): GedcomData {
        try {
            this.parseDocument();
            this.computeGenerations();
        } catch (error) {
            this.data.errors.push(`解析错误: ${error}`);
        }
        return this.data;
    }

    // 从 @I0@ 开始 BFS 计算每个成员的绝对世代
    private computeGenerations(): void {
        // 先全部设为 1（未连接成员的默认世代）
        this.data.individuals.forEach((ind) => {
            ind.generation = 1;
        });

        const rootId = "@I0@";
        if (!this.data.individuals.has(rootId)) return;

        // 构建 parentId -> familyIds（通过扫描 FAM 的 HUSB/WIFE）
        const parentFamilies = new Map<string, string[]>();
        this.data.families.forEach((family) => {
            if (family.husband) {
                if (!parentFamilies.has(family.husband)) parentFamilies.set(family.husband, []);
                parentFamilies.get(family.husband)!.push(family.id);
            }
            if (family.wife) {
                if (!parentFamilies.has(family.wife)) parentFamilies.set(family.wife, []);
                parentFamilies.get(family.wife)!.push(family.id);
            }
        });

        // 构建成员 -> 家庭映射（FAMC：作为子女的家庭）
        const indiFamc = new Map<string, string[]>();
        this.data.individuals.forEach((ind) => {
            for (const conn of ind.families) {
                if (conn.type === "child") {
                    if (!indiFamc.has(ind.id)) indiFamc.set(ind.id, []);
                    indiFamc.get(ind.id)!.push(conn.id);
                }
            }
        });

        const generations = new Map<string, number>();
        generations.set(rootId, 1);
        const queue: string[] = [rootId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const currentGen = generations.get(currentId)!;

            // 查找该成员作为父母的所有家庭
            const familyIds = parentFamilies.get(currentId);
            if (!familyIds) continue;

            for (const familyId of familyIds) {
                const family = this.data.families.get(familyId);
                if (!family) continue;

                // 配偶与本人同代
                const spouseId = family.husband === currentId ? family.wife : family.husband;
                if (spouseId && !generations.has(spouseId)) {
                    generations.set(spouseId, currentGen);
                }

                // 子女比本人晚一代
                for (const childId of family.children) {
                    if (!generations.has(childId)) {
                        generations.set(childId, currentGen + 1);
                        queue.push(childId);
                    }
                }

                // 配偶的父母（姻亲长辈）比配偶早一代，即比本人早一代
                // 入队以便继续遍历他们的其他子女和家庭
                if (spouseId) {
                    const spouseParentIds = indiFamc.get(spouseId);
                    if (spouseParentIds) {
                        for (const spFamId of spouseParentIds) {
                            const spFam = this.data.families.get(spFamId);
                            if (!spFam) continue;
                            if (spFam.husband && !generations.has(spFam.husband)) {
                                generations.set(spFam.husband, currentGen - 1);
                                queue.push(spFam.husband);
                            }
                            if (spFam.wife && !generations.has(spFam.wife)) {
                                generations.set(spFam.wife, currentGen - 1);
                                queue.push(spFam.wife);
                            }
                        }
                    }
                }
            }
        }

        // 写回 individual
        generations.forEach((gen, id) => {
            const ind = this.data.individuals.get(id);
            if (ind) ind.generation = gen;
        });
    }

    private parseLine(line: string): GedcomNode | null {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) return null;

        const level = parseInt(parts[0]!, 10);
        if (Number.isNaN(level)) return null;

        const node: GedcomNode = {
            level,
            tag: parts[1]!,
            children: [],
        };

        if (level === 0 && parts.length >= 3 && parts[1]!.startsWith("@") && parts[1]!.endsWith("@")) {
            node.pointer = parts[1];
            node.tag = parts[2]!;
            if (parts.length > 3) {
                node.data = parts.slice(3).join(" ");
            }
        } else {
            node.tag = parts[1]!;
            if (parts.length > 2) {
                const value = parts.slice(2).join(" ");
                if (value.startsWith("@") && value.endsWith("@")) {
                    node.pointer = value;
                } else {
                    node.data = value;
                }
            }
        }

        return node;
    }

    private parseDocument(): void {
        while (this.currentIndex < this.lines.length) {
            const line = this.lines[this.currentIndex]!;
            const parsed = this.parseLine(line);

            if (!parsed) {
                this.currentIndex++;
                continue;
            }

            if (parsed.level === 0) {
                this.parseRecord(parsed);
            } else {
                this.data.errors.push(`无效的顶级节点: ${line}`);
            }

            this.currentIndex++;
        }
    }

    private parseRecord(node: GedcomNode): void {
        if (!node.pointer && node.tag === "HEAD") {
            this.currentIndex++;
            this.parseChildren(node, 0);
            this.data.header = this.buildRecord(node, "HEAD");
        } else if (node.pointer) {
            this.currentIndex++;
            this.parseChildren(node, 0);
            const record = this.buildRecord(node, node.pointer);
            this.data.records.set(node.pointer, record);

            switch (node.tag) {
                case "INDI":
                    this.parseIndividual(record);
                    break;
                case "FAM":
                    this.parseFamily(record);
                    break;
                case "SUBM":
                    this.parseSubmission(record);
                    break;
                case "OBJE":
                    this.parseMedia(record);
                    break;
            }
        }
    }

    private parseChildren(parent: GedcomNode, parentLevel: number): void {
        while (this.currentIndex < this.lines.length) {
            const line = this.lines[this.currentIndex]!;
            const childNode = this.parseLine(line);

            if (!childNode || childNode.level <= parentLevel) {
                this.currentIndex--;
                break;
            }

            this.currentIndex++;
            this.parseChildren(childNode, childNode.level);
            parent.children.push(childNode);
            this.currentIndex++;
        }
    }

    private buildRecord(node: GedcomNode, id: string): GedcomRecord {
        const record: GedcomRecord = {
            type: node.tag,
            id,
            pointers: new Set(),
            nodes: [],
        };

        for (const child of node.children) {
            record.nodes.push(child);
            if (child.pointer) {
                record.pointers.add(child.pointer);
            }
        }

        return record;
    }

    private parseIndividual(record: GedcomRecord): void {
        const individual: Individual = {
            id: record.id,
            name: "",
            givenName: "",
            sex: "U",
            families: [],
            events: [],
            attributes: [],
            mediaRefs: [],
            notes: [],
            generation: 1,
        };

        for (const node of record.nodes) {
            switch (node.tag) {
                case "NAME":
                    individual.name = node.data || "";
                    for (const child of node.children || []) {
                        if (child.tag === "GIVN") {
                            individual.givenName = child.data || "";
                        } else if (child.tag === "SURN") {
                            individual.surname = child.data;
                        }
                    }
                    break;

                case "SEX":
                    if (node.data && (node.data === "M" || node.data === "F")) {
                        individual.sex = node.data as "M" | "F";
                    }
                    break;

                case "_UID":
                    individual._uid = node.data;
                    break;

                case "CHAN": {
                    const chanNode = node.children?.[0];
                    if (chanNode?.tag === "DATE") {
                        individual.chan = { date: chanNode.data || "" };
                        const timeNode = chanNode.children?.[0];
                        if (timeNode?.tag === "TIME") {
                            individual.chan.time = timeNode.data;
                        }
                    }
                    break;
                }

                case "FAMC":
                    individual.families.push({
                        id: node.pointer || node.data || "",
                        type: "child",
                        pedi: node.children?.find((c) => c.tag === "PEDI")?.data,
                    });
                    break;

                case "FAMS":
                    individual.families.push({
                        id: node.pointer || node.data || "",
                        type: "spouse",
                    });
                    break;

                case "OCCU":
                case "RESI":
                case "FACT":
                    individual.attributes.push({
                        type: node.tag,
                        value: node.data || "",
                        _uid: node.children?.find((c) => c.tag === "_UID")?.data,
                    });
                    break;

                case "MARR":
                case "BIRT":
                case "DEAT": {
                    const event: Event = { type: node.tag };
                    for (const child of node.children || []) {
                        switch (child.tag) {
                            case "DATE":
                                event.date = child.data;
                                break;
                            case "TIME":
                                event.time = child.data;
                                break;
                            case "PLAC":
                                event.place = child.data;
                                break;
                            case "_UID":
                                event._uid = child.data;
                                break;
                        }
                    }
                    individual.events.push(event);
                    break;
                }

                case "OBJE":
                    if (node.pointer) {
                        individual.mediaRefs.push(node.pointer);
                    }
                    break;

                case "NOTE": {
                    let noteText = node.data || "";
                    for (const child of node.children || []) {
                        if (child.tag === "CONT") {
                            noteText += `\n${child.data || ""}`;
                        }
                    }
                    if (noteText) {
                        individual.notes.push(noteText);
                    }
                    break;
                }
            }
        }

        this.data.individuals.set(record.id, individual);
    }

    private parseFamily(record: GedcomRecord): void {
        const family: Family = {
            id: record.id,
            husband: undefined,
            wife: undefined,
            children: [],
            events: [],
            _mstat: undefined,
        };

        for (const node of record.nodes) {
            switch (node.tag) {
                case "HUSB":
                    family.husband = node.pointer || node.data;
                    break;

                case "WIFE":
                    family.wife = node.pointer || node.data;
                    break;

                case "CHIL":
                    if (node.pointer || node.data) {
                        family.children.push(node.pointer || node.data || "");
                    }
                    break;

                case "MARR": {
                    const marriage: Event = { type: "MARR" };
                    for (const child of node.children || []) {
                        switch (child.tag) {
                            case "DATE":
                                marriage.date = child.data;
                                break;
                            case "TIME":
                                marriage.time = child.data;
                                break;
                            case "_UID":
                                marriage._uid = child.data;
                                break;
                        }
                    }
                    family.marriage = marriage;
                    break;
                }

                case "_MSTAT":
                    family._mstat = node.data;
                    break;
            }
        }

        this.data.families.set(record.id, family);
    }

    private parseSubmission(record: GedcomRecord): void {
        const submission: Submission = {
            id: record.id,
            name: "",
        };

        for (const node of record.nodes) {
            if (node.tag === "NAME") {
                submission.name = node.data || "";
            } else if (node.data) {
                submission[node.tag] = node.data;
            }
        }

        this.data.submissions.set(record.id, submission);
    }

    private parseMedia(record: GedcomRecord): void {
        const media: MediaRecord = {
            id: record.id,
            file: "",
            format: undefined,
        };

        for (const node of record.nodes) {
            switch (node.tag) {
                case "FILE":
                    media.file = node.data || "";
                    break;
                case "FORM":
                    media.format = node.data;
                    break;
            }
        }

        this.data.media.set(record.id, media);
    }
}
