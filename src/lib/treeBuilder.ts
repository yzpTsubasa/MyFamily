import type { GedcomData, Individual } from "./gedcomParser";

export interface TreeNode {
    id: string;
    name: string;
    givenName: string;
    sex: string;
    depth: number;
    children: TreeNode[];
    spouse?: TreeNode;
    // 配偶的父母（姻亲长辈）
    spouseParents?: TreeNode[];
    birthDate?: string;
    isDeceased: boolean;
    deathDate?: string;
    note?: string;
    // 过继关系
    fosterParents?: TreeNode[];
    // Layout properties
    x: number;
    y: number;
    subtreeWidth: number;
}

export interface TreeConnection {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    isFoster?: boolean;
    type?: "spouse" | "parent-child";
}

export interface TreeLayout {
    nodes: TreeNode[];
    connections: TreeConnection[];
    totalWidth: number;
    totalHeight: number;
}

export interface TreeFilterOptions {
    minDepth?: number;
    maxDepth?: number;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 55;
const SIBLING_GAP = 20;
const GENERATION_GAP = 80;

function getBirthDate(individual: Individual): string | undefined {
    for (const event of individual.events) {
        if (event.type === "BIRT" && event.date) {
            return event.date;
        }
    }
    return undefined;
}

function isDeceased(individual: Individual): boolean {
    return individual.events.some((e) => e.type === "DEAT");
}

function getDeathDate(individual: Individual): string | undefined {
    for (const event of individual.events) {
        if (event.type === "DEAT" && event.date) {
            return event.date;
        }
    }
    return undefined;
}

export function buildTreeLayout(data: GedcomData, startId: string = "@I0@"): TreeLayout {
    const globalVisited = new Set<string>();
    const root = buildDescendantTree(data, startId, globalVisited, 0);
    if (!root) {
        return { nodes: [], connections: [], totalWidth: 0, totalHeight: 0 };
    }

    calculateSubtreeWidth(root);
    assignPositions(root, 0, 0);

    const nodes: TreeNode[] = [];
    const connections: TreeConnection[] = [];
    collectNodes(root, nodes);

    // 收集配偶父母节点并定位（内部会整体偏移已有节点以避免负坐标）
    collectAndPositionSpouseParents(nodes);

    // 处理过继关系
    processFosterRelationships(data, nodes);

    collectConnections(root, connections);
    // 收集过继关系的连接线
    collectFosterConnections(nodes, connections);
    // 收集配偶父母连接线
    collectSpouseParentConnections(nodes, connections);

    // 根据实际节点位置计算总宽高
    const totalWidth = Math.max(root.subtreeWidth, ...nodes.map((n) => n.x + NODE_WIDTH / 2)) + 40;
    const maxDepth = Math.max(...nodes.map((n) => n.depth));
    const totalHeight = Math.max(...nodes.map((n) => n.y + NODE_HEIGHT)) + 100;

    return { nodes, connections, totalWidth, totalHeight };
}

// 带深度过滤的树布局
export function buildFilteredTreeLayout(
    data: GedcomData,
    startId: string,
    minDepth: number,
    maxDepth: number,
): TreeLayout {
    const globalVisited = new Set<string>();

    // 如果 minDepth > 0，从根开始遍历但不收集浅于 minDepth 的节点
    const root = buildFilteredDescendantTree(data, startId, globalVisited, 0, minDepth, maxDepth);
    if (!root) {
        return { nodes: [], connections: [], totalWidth: 0, totalHeight: 0 };
    }

    calculateSubtreeWidth(root);
    assignPositions(root, 0, 0);

    const nodes: TreeNode[] = [];
    const connections: TreeConnection[] = [];
    collectNodes(root, nodes);

    // 收集配偶父母节点并定位
    collectAndPositionSpouseParents(nodes);

    // 处理过继关系
    processFosterRelationships(data, nodes);

    collectConnections(root, connections);
    collectFosterConnections(nodes, connections);
    collectSpouseParentConnections(nodes, connections);

    const totalWidth = Math.max(root.subtreeWidth, ...nodes.map((n) => n.x + NODE_WIDTH / 2)) + 40;
    const totalHeight = Math.max(...nodes.map((n) => n.y + NODE_HEIGHT)) + 100;

    return { nodes, connections, totalWidth, totalHeight };
}

// 递归调整节点及其后代的深度
function adjustNodeDepths(nodes: TreeNode[], depthShift: number): TreeNode[] {
    return nodes.map((node) => ({
        ...node,
        depth: node.depth - depthShift,
        spouse: node.spouse ? { ...node.spouse, depth: node.spouse.depth - depthShift } : undefined,
        children: adjustNodeDepths(node.children, depthShift),
    }));
}

// 带深度过滤的 DescendantTree 构建
function buildFilteredDescendantTree(
    data: GedcomData,
    startId: string,
    visited: Set<string>,
    depth: number,
    minDepth: number,
    maxDepth: number,
): TreeNode | null {
    // 超过最大深度，停止
    if (depth > maxDepth) return null;

    const individual = data.individuals.get(startId);
    if (!individual || visited.has(startId)) return null;

    visited.add(startId);

    // 构建配偶（不受深度过滤影响，配偶与本人同代）
    let spouse: TreeNode | undefined;
    let spouseParents: TreeNode[] = [];
    for (const familyConn of individual.families) {
        if (familyConn.type === "spouse") {
            const family = data.families.get(familyConn.id);
            if (family) {
                const spouseId = family.husband === startId ? family.wife : family.husband;
                if (spouseId && !visited.has(spouseId)) {
                    const spouseIndividual = data.individuals.get(spouseId);
                    if (spouseIndividual) {
                        visited.add(spouseId);
                        const spouseDisplayName = spouseIndividual.surname
                            ? `${spouseIndividual.surname}${spouseIndividual.givenName}`
                            : spouseIndividual.name.replace(/\s*\/\/\s*$/, "");
                        spouse = {
                            id: spouseIndividual.id,
                            name: spouseDisplayName,
                            givenName: spouseIndividual.givenName,
                            sex: spouseIndividual.sex,
                            depth,
                            children: [],
                            birthDate: getBirthDate(spouseIndividual),
                            isDeceased: isDeceased(spouseIndividual),
                            deathDate: getDeathDate(spouseIndividual),
                            note: spouseIndividual.notes.length > 0 ? spouseIndividual.notes[0] : undefined,
                            x: 0,
                            y: 0,
                            subtreeWidth: 0,
                        };
                        // 收集配偶的原生家庭父母
                        spouseParents = buildSpouseParents(data, spouseId, depth, visited);
                    }
                }
            }
        }
    }

    // 构建子女（递归时深度+1）
    const children: TreeNode[] = [];
    if (depth < maxDepth) {
        for (const [, family] of data.families) {
            if (family.husband === startId || family.wife === startId) {
                for (const childId of family.children) {
                    const childNode = buildFilteredDescendantTree(
                        data,
                        childId,
                        visited,
                        depth + 1,
                        minDepth,
                        maxDepth,
                    );
                    if (childNode) {
                        children.push(childNode);
                    }
                }
            }
        }
    }

    // 如果当前节点深度小于最小深度，不创建节点本身，但保留其子女
    if (depth < minDepth) {
        // 如果没有任何子女，返回 null
        if (children.length === 0) return null;
        // 将所有后代的深度向上调整，使 minDepth 的节点变为 depth 0
        const adjustedChildren = adjustNodeDepths(children, minDepth - depth);
        const displayName = individual.surname
            ? `${individual.surname}${individual.givenName}`
            : individual.name.replace(/\s*\/\/\s*$/, "");

        return {
            id: individual.id,
            name: displayName,
            givenName: individual.givenName,
            sex: individual.sex,
            depth: 0,
            children: adjustedChildren,
            spouse: undefined,
            spouseParents: undefined,
            birthDate: getBirthDate(individual),
            isDeceased: isDeceased(individual),
            deathDate: getDeathDate(individual),
            note: individual.notes.length > 0 ? individual.notes[0] : undefined,
            x: 0,
            y: 0,
            subtreeWidth: 0,
        };
    }

    const displayName = individual.surname
        ? `${individual.surname}${individual.givenName}`
        : individual.name.replace(/\s*\/\/\s*$/, "");

    const node = {
        id: individual.id,
        name: displayName,
        givenName: individual.givenName,
        sex: individual.sex,
        depth: depth - minDepth,
        children,
        spouse: spouse ? { ...spouse, depth: depth - minDepth, note: spouse.note } : undefined,
        spouseParents: spouseParents.length > 0 ? spouseParents : undefined,
        birthDate: getBirthDate(individual),
        isDeceased: isDeceased(individual),
        deathDate: getDeathDate(individual),
        note: individual.notes.length > 0 ? individual.notes[0] : undefined,
        x: 0,
        y: 0,
        subtreeWidth: 0,
    };

    return node;
}

// 处理过继关系
function processFosterRelationships(data: GedcomData, nodes: TreeNode[]): void {
    const nodeMap = new Map<string, TreeNode>();
    nodes.forEach((node) => nodeMap.set(node.id, node));

    // 遍历所有家庭，找到有过继子女的家庭
    for (const [familyId, family] of data.families) {
        for (const childId of family.children) {
            const individual = data.individuals.get(childId);
            if (individual) {
                // 检查该子女是否有过继关系
                for (const familyConn of individual.families) {
                    if (familyConn.type === "child" && familyConn.id === familyId && familyConn.pedi === "foster") {
                        // 找到该子女的节点
                        const childNode = nodeMap.get(childId);
                        if (childNode) {
                            // 找到养父母
                            const fosterParents: TreeNode[] = [];
                            if (family.husband) {
                                const fatherNode = nodeMap.get(family.husband);
                                if (fatherNode) fosterParents.push(fatherNode);
                            }
                            if (family.wife) {
                                const motherNode = nodeMap.get(family.wife);
                                if (motherNode) fosterParents.push(motherNode);
                            }
                            if (fosterParents.length > 0) {
                                childNode.fosterParents = fosterParents;
                            }
                        }
                    }
                }
            }
        }
    }
}

// 收集过继关系的连接线
function collectFosterConnections(nodes: TreeNode[], connections: TreeConnection[]): void {
    nodes.forEach((node) => {
        if (node.fosterParents) {
            node.fosterParents.forEach((fosterParent) => {
                connections.push({
                    fromX: fosterParent.x,
                    fromY: fosterParent.y + NODE_HEIGHT,
                    toX: node.x,
                    toY: node.y,
                    isFoster: true,
                    type: "parent-child",
                });
            });
        }
    });
}

// 收集配偶父母的连接线（从配偶父母连到配偶，而非当前个体）
function collectSpouseParentConnections(nodes: TreeNode[], connections: TreeConnection[]): void {
    nodes.forEach((node) => {
        if (node.spouseParents && node.spouse) {
            node.spouseParents.forEach((parent) => {
                connections.push({
                    fromX: parent.x,
                    fromY: parent.y + NODE_HEIGHT,
                    toX: node.spouse.x,
                    toY: node.spouse.y,
                    type: "parent-child",
                });
            });
        } else if (node.spouseParents && !node.spouse) {
            node.spouseParents.forEach((parent) => {
                connections.push({
                    fromX: parent.x,
                    fromY: parent.y + NODE_HEIGHT,
                    toX: node.x,
                    toY: node.y,
                    type: "parent-child",
                });
            });
        }
    });
}

// 收集配偶父母节点到列表并定位（内部会整体偏移已有节点以避免负坐标）
function collectAndPositionSpouseParents(nodes: TreeNode[]): void {
    let minY = 0;
    let minX = 0;

    // 第一遍：计算所有配偶父母的最小 y 和 x 值
    nodes.forEach((node) => {
        if (node.spouseParents && node.spouseParents.length > 0) {
            const centerX = node.spouse ? node.spouse.x : node.x;
            const parentY = node.spouse ? node.spouse.y - (NODE_HEIGHT + GENERATION_GAP) : node.y - (NODE_HEIGHT + GENERATION_GAP);
            if (parentY < minY) minY = parentY;

            if (node.spouseParents.length === 1) {
                if (centerX - NODE_WIDTH / 2 < minX) minX = centerX - NODE_WIDTH / 2;
            } else {
                const totalW = NODE_WIDTH * 2 + SIBLING_GAP;
                const leftX = centerX - totalW / 2;
                if (leftX < minX) minX = leftX;
            }
        }
    });

    // 计算需要的偏移
    const shiftDown = minY < 0 ? Math.abs(minY) : 0;
    const shiftRight = minX < 0 ? Math.abs(minX) : 0;

    // 将所有已有节点下移和右移
    if (shiftDown > 0 || shiftRight > 0) {
        nodes.forEach((node) => {
            node.y += shiftDown;
            node.x += shiftRight;
        });
    }

    // 第二遍：定位配偶父母并加入列表
    nodes.forEach((node) => {
        if (node.spouseParents && node.spouseParents.length > 0) {
            // 居中对齐配偶节点（如二姑丈公），而非当前个体
            const centerX = node.spouse ? node.spouse.x : node.x;
            const parentY = node.spouse ? node.spouse.y - (NODE_HEIGHT + GENERATION_GAP) : node.y - (NODE_HEIGHT + GENERATION_GAP);

            if (node.spouseParents.length === 1) {
                node.spouseParents[0].x = centerX;
                node.spouseParents[0].y = parentY;
            } else {
                const totalW = NODE_WIDTH * 2 + SIBLING_GAP;
                const leftX = centerX - totalW / 2 + NODE_WIDTH / 2;
                node.spouseParents[0].x = leftX;
                node.spouseParents[0].y = parentY;
                node.spouseParents[1].x = leftX + NODE_WIDTH + SIBLING_GAP;
                node.spouseParents[1].y = parentY;
            }
            nodes.push(...node.spouseParents);
        }
    });
}

// 辅助：从个体的 FAMC 中收集配偶父母节点
function buildSpouseParents(
    data: GedcomData,
    spouseId: string,
    depth: number,
    visited: Set<string>,
): TreeNode[] {
    const spouseIndividual = data.individuals.get(spouseId);
    if (!spouseIndividual) return [];

    const parents: TreeNode[] = [];
    for (const familyConn of spouseIndividual.families) {
        if (familyConn.type === "child") {
            const family = data.families.get(familyConn.id);
            if (!family) continue;
            if (family.husband && !visited.has(family.husband)) {
                visited.add(family.husband);
                const parent = data.individuals.get(family.husband);
                if (parent) {
                    parents.push(createTreeNode(parent, depth - 1));
                }
            }
            if (family.wife && !visited.has(family.wife)) {
                visited.add(family.wife);
                const parent = data.individuals.get(family.wife);
                if (parent) {
                    parents.push(createTreeNode(parent, depth - 1));
                }
            }
        }
    }
    return parents;
}

function createTreeNode(individual: Individual, depth: number): TreeNode {
    const displayName = individual.surname
        ? `${individual.surname}${individual.givenName}`
        : individual.name.replace(/\s*\/\/\s*$/, "");
    return {
        id: individual.id,
        name: displayName,
        givenName: individual.givenName,
        sex: individual.sex,
        depth,
        children: [],
        birthDate: getBirthDate(individual),
        isDeceased: isDeceased(individual),
        deathDate: getDeathDate(individual),
        note: individual.notes.length > 0 ? individual.notes[0] : undefined,
        x: 0,
        y: 0,
        subtreeWidth: 0,
    };
}

function buildDescendantTree(data: GedcomData, startId: string, visited: Set<string>, depth: number): TreeNode | null {
    const individual = data.individuals.get(startId);
    if (!individual || visited.has(startId)) return null;

    visited.add(startId);

    let spouse: TreeNode | undefined;
    let spouseParents: TreeNode[] = [];
    for (const familyConn of individual.families) {
        if (familyConn.type === "spouse") {
            const family = data.families.get(familyConn.id);
            if (family) {
                const spouseId = family.husband === startId ? family.wife : family.husband;
                if (spouseId && !visited.has(spouseId)) {
                    const spouseIndividual = data.individuals.get(spouseId);
                    if (spouseIndividual) {
                        visited.add(spouseId);
                        const spouseDisplayName = spouseIndividual.surname
                            ? `${spouseIndividual.surname}${spouseIndividual.givenName}`
                            : spouseIndividual.name.replace(/\s*\/\/\s*$/, "");
                        spouse = {
                            id: spouseIndividual.id,
                            name: spouseDisplayName,
                            givenName: spouseIndividual.givenName,
                            sex: spouseIndividual.sex,
                            depth,
                            children: [],
                            birthDate: getBirthDate(spouseIndividual),
                            isDeceased: isDeceased(spouseIndividual),
                            deathDate: getDeathDate(spouseIndividual),
                            note: spouseIndividual.notes.length > 0 ? spouseIndividual.notes[0] : undefined,
                            x: 0,
                            y: 0,
                            subtreeWidth: 0,
                        };
                        // 收集配偶的原生家庭父母
                        spouseParents = buildSpouseParents(data, spouseId, depth, visited);
                    }
                }
            }
        }
    }

    const children: TreeNode[] = [];
    for (const [, family] of data.families) {
        if (family.husband === startId || family.wife === startId) {
            for (const childId of family.children) {
                const childNode = buildDescendantTree(data, childId, visited, depth + 1);
                if (childNode) {
                    children.push(childNode);
                }
            }
        }
    }

    const displayName = individual.surname
        ? `${individual.surname}${individual.givenName}`
        : individual.name.replace(/\s*\/\/\s*$/, "");

    const node = {
        id: individual.id,
        name: displayName,
        givenName: individual.givenName,
        sex: individual.sex,
        depth,
        children,
        spouse: spouse ? { ...spouse, note: spouse.note } : undefined,
        spouseParents: spouseParents.length > 0 ? spouseParents : undefined,
        birthDate: getBirthDate(individual),
        isDeceased: isDeceased(individual),
        deathDate: getDeathDate(individual),
        note: individual.notes.length > 0 ? individual.notes[0] : undefined,
        x: 0,
        y: 0,
        subtreeWidth: 0,
    };

    return node;
}

function calculateSubtreeWidth(node: TreeNode): number {
    if (node.spouse) {
        calculateSubtreeWidth(node.spouse);
    }

    if (node.children.length === 0) {
        node.subtreeWidth = node.spouse ? NODE_WIDTH * 2 + SIBLING_GAP : NODE_WIDTH;
        return node.subtreeWidth;
    }

    let totalWidth = 0;
    for (const child of node.children) {
        totalWidth += calculateSubtreeWidth(child);
        if (child !== node.children[node.children.length - 1]) {
            totalWidth += SIBLING_GAP;
        }
    }

    const nodeWidth = node.spouse ? NODE_WIDTH * 2 + SIBLING_GAP : NODE_WIDTH;
    node.subtreeWidth = Math.max(nodeWidth, totalWidth);
    return node.subtreeWidth;
}

function assignPositions(node: TreeNode, leftX: number, y: number): void {
    if (node.spouse) {
        const totalWidth = NODE_WIDTH * 2 + SIBLING_GAP;
        const centerX = leftX + node.subtreeWidth / 2;
        node.x = centerX - totalWidth / 2 + NODE_WIDTH / 2;
        node.spouse.x = centerX + totalWidth / 2 - NODE_WIDTH / 2;
        node.y = y;
        node.spouse.y = y;

        if (node.children.length > 0) {
            const childY = y + NODE_HEIGHT + GENERATION_GAP;
            let currentX = leftX + (node.subtreeWidth - getTotalChildrenWidth(node)) / 2;

            for (const child of node.children) {
                assignPositions(child, currentX, childY);
                currentX += child.subtreeWidth + SIBLING_GAP;
            }
        }
    } else {
        node.x = leftX + node.subtreeWidth / 2;
        node.y = y;

        if (node.children.length > 0) {
            const childY = y + NODE_HEIGHT + GENERATION_GAP;
            let currentX = leftX + (node.subtreeWidth - getTotalChildrenWidth(node)) / 2;

            for (const child of node.children) {
                assignPositions(child, currentX, childY);
                currentX += child.subtreeWidth + SIBLING_GAP;
            }
        }
    }
}

function getTotalChildrenWidth(node: TreeNode): number {
    let width = 0;
    for (const child of node.children) {
        width += child.subtreeWidth;
        if (child !== node.children[node.children.length - 1]) {
            width += SIBLING_GAP;
        }
    }
    return width;
}

function collectNodes(node: TreeNode, nodes: TreeNode[]): void {
    nodes.push(node);
    if (node.spouse) {
        nodes.push(node.spouse);
    }
    for (const child of node.children) {
        collectNodes(child, nodes);
    }
}

function collectConnections(node: TreeNode, connections: TreeConnection[]): void {
    if (node.spouse) {
        connections.push({
            fromX: node.x,
            fromY: node.y + NODE_HEIGHT / 2,
            toX: node.spouse.x,
            toY: node.spouse.y + NODE_HEIGHT / 2,
            type: "spouse",
        });
        const midX = (node.x + node.spouse.x) / 2;
        const midY = node.y + NODE_HEIGHT / 2;
        for (const child of node.children) {
            connections.push({
                fromX: midX,
                fromY: midY,
                toX: child.x,
                toY: child.y,
                type: "parent-child",
            });
            collectConnections(child, connections);
        }
    } else {
        for (const child of node.children) {
            connections.push({
                fromX: node.x,
                fromY: node.y + NODE_HEIGHT,
                toX: child.x,
                toY: child.y,
                type: "parent-child",
            });
            collectConnections(child, connections);
        }
    }
}
