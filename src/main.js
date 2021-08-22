import '@logseq/libs';
import { createApp } from 'vue';
import App from './App.vue';
import './index.css'

function createModel() {
  return {
    show() {
      logseq.showMainUI()
    },
  }
}

function main() {
  logseq.setMainUIInlineStyle({
    zIndex: 11,
  })

  logseq.provideStyle(`
    .icon-hypothesis {
      background-image: url("data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg viewBox='0 0 384 448' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3EGroup%3C/title%3E%3Cg id='Page-1' stroke='none' stroke-width='1' fill='none' fill-rule='evenodd'%3E%3Cg id='Group'%3E%3Cpath d='M240.941176,384 L352.003017,384 C369.64758,384 384,369.674463 384,352.003017 L384,31.9969832 C384,14.3524196 369.674463,0 352.003017,0 L31.9969832,0 C14.3524196,0 0,14.3255373 0,31.9969832 L0,352.003017 C0,369.64758 14.3255373,384 31.9969832,384 L143.058824,384 L192,448 L240.941176,384 L240.941176,384 Z' id='Rectangle-2-Copy-19' fill='%23BD1C2B'%3E%3C/path%3E%3Cpath d='M304,319.790403 C321.673112,319.790403 336,305.510435 336,287.895201 C336,270.279968 321.673112,256 304,256 C286.326888,256 272,270.279968 272,287.895201 C272,305.510435 286.326888,319.790403 304,319.790403 Z' id='Path' fill='%23FFFFFF'%3E%3C/path%3E%3Cpath d='M112.129807,64 L112.129807,176.030906 C112.129807,176.030907 128.173076,144.049455 160,144.04945 C192,144.049446 224.432693,160 224.43269,209.740579 L224.43269,320 L176.302883,320 L176.302883,224.055632 C176.302883,198 160,188 144,192 C128,196 112.129807,213 112.129807,248.04636 L112.129807,320 L64,320 L64,64' id='Path' fill='%23FFFFFF'%3E%3C/path%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: 50% 50%;
      width: 1em;
      height: 1em;
      display: inline-block;
    }
    div[id^="hypothes.is_/"] .block-properties:not(.page-properties) { display: none; }
  `)

  logseq.App.registerUIItem('toolbar', {
    key: 'hypothesis',
    template: `<a data-on-click="show" title="Hypothes.is" class="opacity-40 hover:opacity-100">
    <span class="icon-hypothesis"></span>
    </a>`,
  })

  createApp(App).mount('#app');
}

// bootstrap
logseq.ready(createModel()).then(main);
