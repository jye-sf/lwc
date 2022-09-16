import { createElement } from 'lwc';
import XComplex from 'x/complex';
import XTest from 'x/test';

describe('lwc:if, lwc:elseif, lwc:else directives', () => {
    it('should render if branch if the value for lwc:if is truthy', () => {
        const elm = createElement('x-test', { is: XTest });
        elm.showIf = true;
        document.body.appendChild(elm);

        expect(elm.shadowRoot.querySelector('.if')).not.toBeNull();
    });

    it('should render elseif branch if the value for lwc:if is falsy and the value for lwc:elseif is truthy', () => {
        const elm = createElement('x-test', { is: XTest });
        elm.showElseif = true;
        document.body.appendChild(elm);

        expect(elm.shadowRoot.querySelector('.elseif')).not.toBeNull();
    });

    it('should render else branch if the values for lwc:if and lwc:elseif are all falsy', () => {
        const elm = createElement('x-test', { is: XTest });
        document.body.appendChild(elm);

        expect(elm.shadowRoot.querySelector('.else')).not.toBeNull();
    });

    it('should update which branch is rendered if the value changes', () => {
        const elm = createElement('x-test', { is: XTest });
        elm.showIf = true;
        document.body.appendChild(elm);

        expect(elm.shadowRoot.querySelector('.if')).not.toBeNull();

        elm.showIf = false;
        return Promise.resolve()
            .then(() => {
                expect(elm.shadowRoot.querySelector('.else')).not.toBeNull();
                elm.showElseif = true;
            })
            .then(() => {
                expect(elm.shadowRoot.querySelector('.elseif')).not.toBeNull();
                elm.showIf = true;
            })
            .then(() => {
                expect(elm.shadowRoot.querySelector('.if')).not.toBeNull();
            });
    });

    it('should render content when nested inside another if branch', () => {
        const element = createElement('x-complex', { is: XComplex });
        element.showNestedContent = true;
        document.body.appendChild(element);

        expect(element.shadowRoot.querySelector('.nestedContent')).not.toBeNull();
    });

    it('should rerender content when nested inside another if branch', () => {
        const element = createElement('x-complex', { is: XComplex });
        document.body.appendChild(element);

        expect(element.shadowRoot.querySelector('.nestedElse')).not.toBeNull();

        element.showNestedContent = true;
        return Promise.resolve().then(() => {
            expect(element.shadowRoot.querySelector('.nestedContent')).not.toBeNull();
        });
    });

    it('should render list content properly', () => {
        const element = createElement('x-complex', { is: XComplex });
        element.showList = true;
        document.body.appendChild(element);

        expect(element.shadowRoot.querySelector('.if').textContent).toBe('123');
    });

    it('should rerender list content when updated', () => {
        const element = createElement('x-complex', { is: XComplex });
        document.body.appendChild(element);

        expect(element.shadowRoot.querySelector('.else')).not.toBeNull();

        element.showList = true;
        return Promise.resolve()
            .then(() => {
                expect(element.shadowRoot.querySelector('.if').textContent).toBe('123');

                element.refreshList();
            })
            .then(() => {
                expect(element.shadowRoot.querySelector('.if').textContent).toBe('1234');

                element.showList = false;
                element.refreshList();
            })
            .then(() => {
                expect(element.shadowRoot.querySelector('.else')).not.toBeNull();

                element.showList = true;
            })
            .then(() => {
                expect(element.shadowRoot.querySelector('.if').textContent).toBe('12345');
            });
    });
});
