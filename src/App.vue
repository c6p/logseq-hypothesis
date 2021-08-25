<template>
  <div id="wrapper" @click="onClickOutside">
    <div id="hypothesis" v-if="visible">
      <div id="form">
        <label for="token">API token:</label>
        <input id="token" :value="apiToken" @change="setAPIToken" />
        <button id="fetch" @click="fetchUpdates()">Fetch Updates</button>
        <label for="user">User:</label>
        <input id="user" placeholder="username@hypothes.is" :value="user" @change="setUser" />
        <button id="create" @click="loadPageNotes(uri)">Get Selected Page</button>
        <select id="uri" v-model="uri"><option v-for="u in uris" :key="u">{{ u }}</option></select>
      </div>
    </div>
  </div>  
</template>

<script>
import axios from 'axios';

const delay = (t = 100) => new Promise(r => setTimeout(r, t))
const flatten = array => array.reduce((a, {children = []}) => a.concat(flatten(children)), array);

export default {
  name: 'App',
  components: {},
  data () {
    return {
      visible: false,
      left: 0,
      apiToken: "",
      user: "",
      annotations: [],
      uri: "",
    }
  },
  computed: {
    uris: function() { return [...new Set((this.annotations || []).map(a => a.uri))].reverse() }
  },
  mounted () {
    logseq.once('ui:visible:changed', ({ visible }) => {
      visible && (this.visible = true);
      // init
      const s = logseq.settings;
      this.apiToken = s.apiToken;
      this.user = s.user;
      this.annotations = s.annotations;
    })
  },
  methods: {
    hideMainUI() {
      logseq.hideMainUI()
    },
    onClickOutside ({ target }) {
      const inner = target.closest('#hypothesis')
      !inner && this.hideMainUI()
    },
    setAPIToken (e) {
      const apiToken = e.target.value;
      logseq.updateSettings({apiToken})
      this.apiToken = apiToken || "";
    },
    setUser (e) {
      const user = e.target.value;
      logseq.updateSettings({user})
      this.user = user || "";
    },
    fetchUpdates() { 
      this.getAnnotations(logseq.settings);
    },
    async getAnnotations(s) {
      const a = s.annotations || [];
      let annotationMap = new Map(a.map(v => [v.id, v]));
      // fetch rows
      let updated = a.length ? a[a.length-1]?.updated : undefined;
      let rows = []
      while (true) {
        rows = await this.fetchAnnotations(updated);
        if (rows.length === 0)
          break
        updated = rows[rows.length-1].updated
        // update map
        for (const r of rows)
          annotationMap.set(r.id, r)
      }
      // sort by created then save
      const annotations = [...annotationMap.values()].sort((a,b) => b.created < a.created ? 1 : -1)
      await logseq.updateSettings({annotations: null}); // clear settings, BUG? else array size growing
      await logseq.updateSettings({annotations}); // clear settings, BUG? else array size growing
      this.annotations = annotations;
    },
    async fetchAnnotations(search_after) {
      const res = await axios.get("https://api.hypothes.is/api/search", {
        headers: { Authorization: `Bearer ${this.apiToken}` },
        params: {
          limit: 200,
          order: 'asc',
          user: `acct:${this.user}`,
          search_after,
        },
      });
      return res.data.rows;
    },
    getPageNotes(uri) {
      let notes = logseq.settings?.annotations?.filter(x => x.uri === uri);
      const title = notes[0]?.document.title;
      const hids = new Set(notes.map(({id})=>id));
      let noteMap = new Map(notes.reduce((acc, { id, text, tags, target, updated, references }) => {
        const exact = target[0]?.selector?.filter(s => 'exact' in s)[0]?.exact;
        tags = tags.map(t => `#[[${t}]]`).join(" ");
        let content = "";
        if (exact) {
          content += `📌 ${exact} ${tags}`;
          if (text)
            content += `\n📝 ${text}`;
        } else {
          content += `📝 ${text} ${tags}`;
        }
        let properties = { hid: id, updated };
        // add deleted references
        for (const [i, r] of (references?.entries() ?? [])) {
          if (!hids.has(r)) {
            acc.push([r, { content: "🗑️", properties: {hid: r}, parent: references[i-1] }])
          }
        }
        // add note
        acc.push([id, { content, properties, parent: references ? references[references.length-1] : undefined }]);
        return acc;
      }, []));
      // create tree
      let after = null;
      for (const block of noteMap.values()) {
        const hid = block.parent;
        if (!hid) {
          if (after)
            block.after = after
          after = block.properties.hid;
          continue;
        }
          let ref = noteMap.get(hid);
          if (ref.children)
            block.after = ref.children[ref.children.length-1].properties.hid;
          else
            ref.children = [];
          ref.children.push(block);
      }

      return {title, noteMap}
    },
    async loadPageNotes(uri) {
      if (!uri) return
      const name = 'hypothesis__/' + uri.split('//')[1]
      logseq.App.pushState('page', { name })
      await delay(300)

      try {
        const page = await logseq.Editor.getCurrentPage();
        if (name !== page.originalName)
          throw new Error('page error');

        let pageBlocksTree = await logseq.Editor.getCurrentPageBlocksTree();
        let targetBlock = pageBlocksTree[0];
        if (targetBlock)
          await logseq.Editor.updateBlock(targetBlock.uuid, 'Loading annotations...')
        else {
          targetBlock = await logseq.Editor.insertBlock(page.name, 'Loading annotations...', { isPageBlock: true })
          pageBlocksTree = [targetBlock];
        }

        let {title, noteMap} = this.getPageNotes(uri);

        const blocks = pageBlocksTree.slice(1);
        const blockMap = new Map(flatten(blocks).map(b=>[b.properties.hid, b]));
        const n_b = [...noteMap.values()].filter(n=>!blockMap.has(n.properties.hid));

        for (const n of n_b) {
          const {hid,updated} = n.properties;
          const content = `${n.content}\n:PROPERTIES:\n:hid:${hid}\n:updated:${updated}\n:END:`;
          const {parent, after} = n;
          const source = blockMap.get(parent ?? after);
          const block = await logseq.Editor.insertBlock(source?.uuid ?? page.name, content, {sibling: !parent, isPageBlock: !source});
          blockMap.set(hid, block);
        }
        // TODO
        // updated = map(notes, .updated) != map(blocks, .updated)
        // updateBlock(updated, content) 
        // delete set(blocks).difference(set(notes))

        await logseq.Editor.updateBlock(targetBlock.uuid, `[:a {:href "${uri}" :target "_blank" :class "external-link"} [:span {:class "icon-hypothesis forbid-edit"}] " ${title}"]`);
      } catch (e) {
        logseq.App.showMsg(e.toString(), 'warning');
      }
    },
  },
}
</script>