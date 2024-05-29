import { LightningElement } from 'lwc';

export default class Child extends LightningElement {
    disconnectedCallback() {
        // eslint-disable-next-line no-console
        console.log('child - disconnectedCalback');
    }
}
