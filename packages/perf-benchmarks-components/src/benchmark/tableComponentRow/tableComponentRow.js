/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { LightningElement, api } from 'lwc';

export default class TableComponentRow extends LightningElement {
    _row;

    @api
    get row() {
        return this._row;
    }

    set row(v) {
        this._row = v;
    }

    handleSelect() {
        this.dispatchEvent(new CustomEvent('select'));
    }

    handleRemove() {
        this.dispatchEvent(new CustomEvent('remove'));
    }
}
