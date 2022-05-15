import "@logseq/libs";
import Vue from "vue";
import vSelect from "vue-select";
import App from "./App.vue";
import "./index.css";
import Font from "./icomoon.woff";
import settings from "./settingsSchema.json";

function main() {
  const pluginId = logseq.baseInfo.id;
  console.info(`#${pluginId}: MAIN`);

  Vue.component("v-select", vSelect);
  const app = new Vue({ el: "#app", render: (h) => h(App) });

  function createModel() {
    return {
      show() {
        logseq.showMainUI();
      },
      updatePage() {
        app.$children[0].updatePage();
      },
    };
  }

  logseq.provideModel(createModel());
  logseq.setMainUIInlineStyle({
    zIndex: 11,
  });

  logseq.provideStyle(String.raw`
    @font-face {
      font-family: 'icomoon';
      src:  url(${Font}) format('woff');
      font-weight: normal;
      font-style: normal;
      font-display: block;
    }
    [class^="icon-"], [class*=" icon-"] {
      font-family: 'icomoon' !important;
      speak: never;
      font-style: normal;
      font-weight: normal;
      font-variant: normal;
      text-transform: none;
      line-height: 1;
      -webkit-font-smoothing: antialiased;
    }
    .icon-hypothesis {
      font-size: 20px;
    }
    .icon-hypothesis:before {
      content: "\e900";
    }
    div[id^="hypothesis__/"] .block-properties:not(.page-properties) { display: none; }
  `);

  logseq.useSettingsSchema(settings);

  logseq.App.registerUIItem("toolbar", {
    key: "hypothesis",
    template: `<a data-on-click="show" title="Hypothes.is" class="button">
    <span class="icon-hypothesis"></span>
    </a>`,
  });

  logseq.App.registerUIItem("pagebar", {
    key: "hypothesis-page",
    template: `<a data-on-click="updatePage" title="Update current page" class="button">
    <span class="icon-hypothesis"></span>
    </a>`,
  });
}

logseq.ready(main).catch(console.error);
