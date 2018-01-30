import { isTag, Node, Container, Tag } from 'postcss-selector-parser';

export function isCustomElement(node: Node): node is Tag {
    return isTag(node) && node.value.includes('-');
}

export function findNode(
    container: Container,
    predicate: (node: Node) => boolean,
): Node | undefined {
    return container && container.nodes && container.nodes.find(predicate);
}

export function replaceNodeWith(oldNode: Node, ...newNodes: Node[]) {
    if (newNodes.length) {
        const { parent } = oldNode;

        if (!parent) {
            throw new Error(`Impossible to replace root node.`);
        }

        newNodes.forEach(node => {
            parent.insertBefore(oldNode, node);
        });

        oldNode.remove();
    }
}

export function trimNodeWhitespaces(node: Node) {
    if (node && node.spaces) {
        node.spaces.before = '';
        node.spaces.after = '';
    }
}
