import { createElement } from 'lwc';
import Parent from 'x/parent';

describe('lwc:forEach before lwc:if', () => {
    it('should add values to the iteration before the lwc:if content', async function () {
        const elm = createElement('x-custom-render', { is: Parent });
        document.body.appendChild(elm);
        // debugger;

        elm.addItem();
        elm.addItem();
        elm.addItem();

        return Promise.resolve().then(() => {
            // debugger;
        });
    });
});
