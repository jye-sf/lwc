import { registerTemplate } from "lwc";
function tmpl($api, $cmp, $slotset, $ctx) {
  function forof1_1(xValue, xIndex, xFirst, xLast) {
    function if2_0() {
      return api_element(
        "div",
        {
          key: api_key(3, x.value.key),
        },
        [api_text("Text")]
      );
    }
    const x = {
      value: xValue,
      index: xIndex,
      first: xFirst,
      last: xLast,
    };
    return [
      api_element(
        "div",
        {
          attrs: {
            "data-islast": x.last,
            "data-isfirst": x.first,
          },
          key: api_key(1, x.value.id),
        },
        [
          api_element(
            "span",
            {
              key: 2,
            },
            [api_text("Row: "), api_dynamic(x.index)]
          ),
          api_text(". Value: "),
          api_dynamic(x.value),
        ]
      ),
      $cmp.isTrue ? if2_0() : null,
    ];
  }
  const {
    k: api_key,
    t: api_text,
    d: api_dynamic,
    h: api_element,
    i: api_iterator,
  } = $api;
  return [
    api_element(
      "section",
      {
        key: 0,
      },
      api_iterator($cmp.items, forof1_1)
    ),
  ];
}
export default registerTemplate(tmpl);
tmpl.stylesheets = [];
