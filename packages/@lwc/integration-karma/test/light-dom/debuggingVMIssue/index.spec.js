import { createElement } from 'lwc';

import LightContainer from './x/lightContainer/lightContainer';

describe('test debugging', () => {
    let lightContainer;

    beforeAll(() => {
        lightContainer = createElement('x-light-container', { is: LightContainer });
        document.body.appendChild(lightContainer);
    });

    afterAll(() => {
        document.body.removeChild(lightContainer);
    });

    it('test', () => {
        // eslint-disable-next-line no-console
        console.log(lightContainer);
    });
});
