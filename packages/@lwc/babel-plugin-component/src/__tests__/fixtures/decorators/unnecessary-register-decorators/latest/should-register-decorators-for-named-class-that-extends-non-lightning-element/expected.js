import { registerDecorators as _registerDecorators, registerComponent as _registerComponent } from "lwc";
import _tmpl from "./test.html";
import MyCoolMixin from './mixin.js';
class MyElement extends MyCoolMixin {
  foo;
  /*LWC compiler vX.X.X*/
}
_registerDecorators(MyElement, {
  publicProps: {
    foo: {
      config: 0
    }
  }
});
const __lwc_component_class_internal = _registerComponent(MyElement, {
  tmpl: _tmpl,
  sel: "lwc-test",
  apiVersion: 9999999
});
export default __lwc_component_class_internal;