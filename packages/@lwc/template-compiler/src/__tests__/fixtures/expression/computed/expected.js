import { registerTemplate } from "lwc";
function tmpl($api, $cmp, $slotset, $ctx) {
  const { val: $cv0_0, state: $cv0_1 } = $cmp;
  function foreach1_0(item, index) {
    const { arr: $cv1_0 } = $cmp;
    return [
      api_dynamic($cv1_0[index]),
      api_text(" "),
      api_dynamic($cv1_0[$cv0_1.val]),
    ];
  }
  const { d: api_dynamic, t: api_text, i: api_iterator, f: api_flatten } = $api;
  return api_flatten([
    api_dynamic($cv0_0),
    api_text(" "),
    api_dynamic($cv0_0[$cv0_1.foo]),
    api_text(" "),
    api_dynamic($cv0_0[$cv0_1.foo][$cv0_1.bar]),
    api_iterator($cmp.arr, foreach1_0),
  ]);
}
export default registerTemplate(tmpl);
tmpl.stylesheets = [];
