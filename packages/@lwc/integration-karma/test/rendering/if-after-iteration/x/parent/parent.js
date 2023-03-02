import { LightningElement, api, track } from 'lwc';

export default class CustomRender extends LightningElement {
    @track
    items = [0];
    counter = 1;

    @api
    addItem() {
        this.items.push(this.counter++);
    }
}
