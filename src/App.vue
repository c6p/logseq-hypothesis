<template>
  <div id="wrapper" @click="onClickOutside">
    <div id="hypothesis" v-if="visible" :class="theme">
      <div id="form">
        <div class="buttons">
          <span v-if="noAccount"
            >Please, add your
            <a href="https://hypothes.is/account/developer" target="_blank">
              API token
            </a>
            and user account!
          </span>
          <button id="settings" @click="showSettingsUI">
            <span>⚙️ Settings</span>
          </button>
          <button id="fetch" @click="fetchUpdates()" :disabled="fetching">
            <span v-if="fetching">Fetching updates... </span>
            <span v-else>🔄 Fetch latest notes</span>
          </button>
        </div>
        <h2>Create/Update a page from hypothes.is notes</h2>
        <v-select
          ref="select"
          class="select"
          id="uri"
          v-model="item"
          :get-option-label="(i) => `${i.title} | ${i.uri}`"
          :filter="fuseSearch"
          :options="items"
          :clearable="false"
        >
          <template #option="{ uri, title }">
            <b>{{ title }}</b>
            <br />
            {{ uri }}
          </template>
        </v-select>
        <button
          id="create"
          @click="loadPage(item)"
          :disabled="item.uri === '' && item.title === ''"
        >
          Add page notes to graph
        </button>
      </div>
    </div>
    <div v-if="fetching || updating" class="lds-ripple">
      <div></div>
      <div></div>
    </div>
  </div>
</template>

<script>
import axios from "axios";
import Fuse from "fuse.js";
import { from as iterFrom } from "core-js-pure/features/iterator";
import settings from "./settingsSchema.json";

const delay = (t = 100) => new Promise((r) => setTimeout(r, t));
const flatten = (array) =>
  array.reduce((a, { children = [] }) => a.concat(flatten(children)), array);

export default {
  name: "App",
  components: {},
  data() {
    return {
      lastFetch: +new Date(),
      fetching: false,
      updating: false,
      visible: false,
      left: 0,
      annotations: [],
      item: { uri: "", title: "" },
      theme: "dark",
      noAccount: true,
    };
  },
  computed: {
    items: function () {
      return [
        ...iterFrom(
          new Map(
            (this.annotations || []).map((a) => [a.uri, a.document.title?.[0]])
          ).entries()
        ).map(([uri, title]) => {
          return { uri, title };
        }),
      ].reverse();
    },
  },
  async mounted() {
    logseq.once("ui:visible:changed", async ({ visible }) => {
      visible && (this.visible = true);
      // init
      const fs = logseq.FileStorage;
      if (await fs.hasItem("annotations")) {
        this.annotations = JSON.parse(await fs.getItem("annotations"));
      }
      // clear annotations kept in the settings prior to v0.2.3
      logseq.updateSettings({ annotations: null });
    });
    logseq.on("ui:visible:changed", ({ visible }) => {
      visible && this.$nextTick(() => this.$refs.select.$el.focus());
    });
    logseq.onSettingsChanged((s) => {
      const { user, apiToken } = s;
      this.noAccount = !(user && apiToken);
      console.log(user, apiToken, this.noAccount);
    });

    logseq.App.onThemeModeChanged((s) => {
      this.theme = s.mode;
    });

    this.theme = (await logseq.App.getUserConfigs()).preferredThemeMode;
  },
  methods: {
    fuseSearch(options, search) {
      const fuse = new Fuse(options, {
        keys: ["title", "uri"],
      });
      return search.length
        ? fuse.search(search).map(({ item }) => item)
        : fuse.list;
    },
    hideMainUI() {
      logseq.hideMainUI();
    },
    showSettingsUI() {
      logseq.showSettingsUI();
    },
    onClickOutside({ target }) {
      const inner = target.closest("#hypothesis");
      !inner && this.hideMainUI();
    },
    async fetchUpdates() {
      this.fetching = true;
      await this.getAnnotations(logseq.settings);
      this.lastFetch = +new Date();
      this.fetching = false;
    },
    async getAnnotations(s) {
      const a = this.annotations || [];
      let annotationMap = new Map(a.map((v) => [v.id, v]));
      // fetch rows
      let updated = a.length ? a[a.length - 1]?.updated : undefined;
      let rows = [];
      while (true) {
        rows = await this.fetchAnnotations(updated);
        if (rows.length === 0) break;
        updated = rows[rows.length - 1].updated;
        // update map
        for (const r of rows) annotationMap.set(r.id, r);
      }
      // sort by created then save
      const annotations = [...annotationMap.values()].sort((a, b) =>
        b.created < a.created ? 1 : -1
      );
      annotations.forEach((a) =>
        ["user", "user_info", "permissions"].forEach((k) => delete a[k])
      );
      await logseq.FileStorage.setItem(
        "annotations",
        JSON.stringify(annotations)
      );
      this.annotations = annotations;
    },
    async fetchAnnotations(search_after) {
      const { user, apiToken } = logseq.settings;
      const res = await axios.get("https://api.hypothes.is/api/search", {
        headers: { Authorization: `Bearer ${apiToken}` },
        params: {
          limit: 200,
          order: "asc",
          user: `acct:${user}${!user.includes("@") ? "@hypothes.is" : ""}`,
          search_after,
        },
      });
      return res.data.rows;
    },
    getPageNotes(uri) {
      const { highlightFormat, annotationFormat, noteFormat, deletedFormat } =
        logseq.settings;
      const defaults = Object.fromEntries(
        settings.map((s) => [s.key, s.default])
      );
      let annotations = this.annotations?.filter((x) => x.uri === uri);
      const title = annotations[0]?.document.title[0];
      const hids = new Set(annotations.map(({ id }) => id));
      let noteMap = new Map(
        annotations.reduce(
          (acc, { id, text, tags, target, updated, references }) => {
            const exact = target[0]?.selector?.filter((s) => "exact" in s)[0]
              ?.exact;
            tags = tags.map((t) => `#[[${t}]]`).join(" ");
            let content = "";
            if (exact) {
              content += (highlightFormat || defaults.highlightFormat)
                .replace("{text}", exact)
                .replace("{tags}", tags);
              if (text)
                content +=
                  "\n\n" +
                  (annotationFormat || defaults.annotationFormat)
                    .replace("{text}", text)
                    .replace("{tags}", tags);
            } else {
              content += (noteFormat || defaults.noteFormat)
                .replace("{text}", text)
                .replace("{tags}", tags);
            }
            let properties = { hid: id, updated };
            // add deleted references
            for (const [i, r] of references?.entries() ?? []) {
              if (!hids.has(r)) {
                acc.push([
                  r,
                  {
                    content: deletedFormat || defaults.deletedFormat,
                    properties: { hid: r },
                    parent: references[i - 1],
                  },
                ]);
              }
            }
            // add note
            acc.push([
              id,
              {
                content,
                properties,
                parent: references
                  ? references[references.length - 1]
                  : undefined,
              },
            ]);
            return acc;
          },
          []
        )
      );
      // create tree
      let after = null;
      for (const block of noteMap.values()) {
        const hid = block.parent;
        if (!hid) {
          if (after) block.after = after;
          after = block.properties.hid;
          continue;
        }
        let ref = noteMap.get(hid);
        if (ref.children)
          block.after = ref.children[ref.children.length - 1].properties.hid;
        else ref.children = [];
        ref.children.push(block);
      }

      return { title, noteMap };
    },
    async loadPage({ uri }) {
      if (!uri || this.updating) return;
      this.updating = true;

      try {
        let { title: hypothesisTitle, noteMap } = this.getPageNotes(uri);
        const logseqTitle =
          (await this.findPageName(uri)) || (await this.findPageNameV1(uri));

        //If page isn't found, create new one with hypothesisTitle. This
        //approach allows for the title to be changed by the user
        const pageTitle = logseqTitle
          ? logseqTitle
          : "hypothesis__/" + hypothesisTitle;
        logseq.App.pushState("page", { name: pageTitle });
        await delay(300);

        const page = await logseq.Editor.getCurrentPage();
        if (pageTitle !== page.originalName) throw new Error("page error");

        await this.loadPageNotes(page, uri, hypothesisTitle, noteMap);
      } finally {
        this.updating = false;
      }
    },
    async findPageName(uri) {
      const finds = (
        await logseq.DB.datascriptQuery(`
      [:find (pull ?b [*])
       :where
       [?b :block/properties ?p]
       [?b :block/name _]
       [(get ?p :hypothesis-uri) ?t]
       [(= "${uri}" ?t)]]
       `)
      ).flat();

      if (finds.length > 1) {
        //TODO: throw error
        throw new Error("Multiple pages has the same title");
      } else if (finds.length == 0) {
        //throw new Error("Page doesn't exist")
        console.log("Page doesn't exist");
        return;
      } else return finds[0]["original-name"];
    },
    async findPageNameV1(uri) {
      const name = "hypothesis__/" + uri.replace(".", "/").split("//")[1];
      const finds = (
        await logseq.DB.datascriptQuery(`
        [:find (pull ?b [*]) :where [?b :block/name "${name}"]]`)
      ).flat();
      return finds.length ? finds[0]["original-name"] : null;
    },
    async loadPageNotes(page, uri, title, noteMap) {
      if (!page || !uri) return;

      const pageProperties = {
        // hypothesis-uri is the prop by which the plugin identifies each page
        "hypothesis-uri": uri,
        "hypothesis-title": title,
        // hypothesis-naming-scheme is added for improved backwards compatability for later updates
        "hypothesis-naming-scheme": "0.2.0",
      };

      let pageBlocksTree = await logseq.Editor.getCurrentPageBlocksTree();
      let pagePropBlock = pageBlocksTree[0];
      if (!pagePropBlock) {
        pagePropBlock = await logseq.Editor.insertBlock(page.name, "", {
          isPageBlock: true,
          properties: pageProperties,
        });
        pageBlocksTree = [pagePropBlock];
      }

      const blocks = pageBlocksTree.slice(1);
      const blockMap = new Map(
        flatten(blocks)
          .filter((b) => b?.properties && b?.properties?.hid)
          .map((b) => [b.properties.hid, b])
      );
      const n_b = [...noteMap.values()].filter(
        (n) => !blockMap.has(n.properties.hid)
      );

      for (const n of n_b) {
        const { hid, updated } = n.properties;
        const content = n.content.trim();
        const { parent, after } = n;
        const source = blockMap.get(parent ?? after);
        const block = await logseq.Editor.insertBlock(
          source?.uuid ?? page.name,
          content,
          {
            properties: {
              hid,
              updated,
            },
            sibling: !parent,
            isPageBlock: !source,
          }
        );
        blockMap.set(hid, block);
      }

      // upgrade pre-block with page-properties from old format
      const newFormat = "preBlock?" in pagePropBlock;
      if (!newFormat) await logseq.Editor.updateBlock(pagePropBlock.uuid, "");
      await Object.entries(pageProperties).map(async ([property, value]) => {
        await logseq.Editor.upsertBlockProperty(
          pagePropBlock.uuid,
          property,
          value
        );
      });
      // workaround to force preBlock? - see https://github.com/logseq/logseq/issues/5298
      if (!newFormat) {
        const content = (await logseq.Editor.getBlock(pagePropBlock.uuid))
          .content;
        await logseq.Editor.updateBlock(pagePropBlock.uuid, "");
        await logseq.Editor.updateBlock(pagePropBlock.uuid, content);
      }
    },
    async updatePage() {
      const page = await logseq.Editor.getCurrentPage();
      let uri = page?.properties?.hypothesisUri;
      if (!uri) {
        if (!page.name.startsWith("hypothesis__/"))
          // handle naming scheme v0.1
          return;
        const pageBlocksTree = await logseq.Editor.getCurrentPageBlocksTree();
        if (pageBlocksTree.length < 1) return;
        const re = /{:href\s"(.*?)"/;
        const m = pageBlocksTree[0].content.match(re);
        if (!m || !m[1]) return;
        uri = m[1];
      }
      await this.fetchUpdates();
      const { title, noteMap } = this.getPageNotes(uri);
      await this.loadPageNotes(page, uri, title, noteMap);
    },
  },
};
</script>
