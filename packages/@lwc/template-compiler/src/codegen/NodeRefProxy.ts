export class NodeRefProxy {
    instance: any;
    target: any;

    constructor(target: any) {
        this.target = target
        this.instance = new Proxy({}, {
            has: (dummy: any, property: PropertyKey) => {
                return property in this.target;
            },

            get: (dummy: any, property: PropertyKey) => {
                return this.target[property];
            },

            set: (dummy: any, property: PropertyKey, value: any) => {
                this.target[property] = value;
                return true;
            }
        });
    }

    swap(newTarget: any) {
        this.target = newTarget;
    }
}
