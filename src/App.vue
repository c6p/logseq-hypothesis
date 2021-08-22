<template>
  <div id="wrapper" @click="onClickOutside">
    <div id="hypothesis" v-if="visible">
      <div id="form">
        <label for="token">API token:</label>
        <input id="token" :value="apiToken" @change="setAPIToken" />
        <label for="user">User:</label>
         <input id="user" placeholder="username@hypothes.is" :value="user" @change="setUser" />
        <label for="uri">URIs:</label>
        <select id="uri" v-model="uri"><option v-for="u in uris" :key="u">{{ u }}</option></select>
        <button @click="loadPageNotes(uri)">open</button>
      </div>
      <!--<label>Groups
        <select v-model="group_id" @change="getGroup">
          <option v-for="g in groups" :key="g.id" :value="g.id">
            {{ g.name }}
          </option>
        </select>
      </label>  -->
    </div>
  </div>  
</template>

<script>
import axios from 'axios';

const delay = (t = 100) => new Promise(r => setTimeout(r, t))

export default {
  name: 'App',
  components: {},
  data () {
    return {
      visible: false,
      left: 0,
      apiToken: "",
      user: "",
      //groups: [],
      //group_id: null,
      //group: {},
      annotations: [],
      uri: "",
    }
  },
  computed: {
    uris: function() { return [...new Set(this.annotations.map(a => a.uri))] }
  },
  mounted () {
    logseq.once('ui:visible:changed', ({ visible }) => {
      visible && (this.visible = true);
      // init
      const s = logseq.settings;
      this.apiToken = s.apiToken;
      this.user = s.user;
      this.getAnnotations(s);
    })
    /*logseq.on('ui:visible:changed', ({ visible }) => {
      if (visible) {
        const el = top.document.querySelector(`div[data-injected-ui="hypothesis-c6p_logseq-hypothesis"]`)
        const {left} = el.getBoundingClientRect()
        this.left = left - 100
      }
    })*/
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
    //async getGroups() {
    //  const res = await axios.get("https://api.hypothes.is/api/groups", {headers: this.headers});
    //  this.groups = res.data;
    //  console.warn(this.groups)
    //},
    //async getGroup() {
    //  const res = await axios.get(`https://api.hypothes.is/api/groups/${this.group_id}`, this.headers);
    //  this.group = res.data;
    //  console.warn(this.group)
    //},
    async getAnnotations(s) {
      const a = s.annotations || [];
      let annotationMap = new Map(a.map(v => [v.id, v]));
      console.warn(annotationMap);
      // fetch rows
      let updated = a.length ? a[a.length-1]?.updated : undefined;
      console.warn(updated)
      let rows = []
      while (true) {
        rows = await this.fetchAnnotations(updated);
        if (rows.length === 0)
          break
        updated = rows[rows.length-1].updated
        // update map
        for (const r of rows)
          annotationMap.set(r.id, r)
        console.warn(annotationMap);
      }
      // sort and save
      const annotations = [...annotationMap.values()].sort((a,b) => b.updated < a.updated ? 1 : -1)
      this.annotations = annotations;
      console.warn(this.annotations)
      await logseq.updateSettings({annotations});
    },
    async fetchAnnotations(search_after) {
      console.warn(this)
      const res = await axios.get("https://api.hypothes.is/api/search", {
        headers: { Authorization: `Bearer ${this.apiToken}` },
        params: {
          limit: 200,
          order: 'asc',
          user: `acct:${this.user}`,
          search_after,
        },
      });
      console.warn(res)
      return res.data.rows;
    },
    getPageNotes(uri) {
      let notes = logseq.settings?.annotations?.filter(x => x.uri === uri);
      const title = notes[0]?.document.title;
      let noteMap = new Map(notes.map(({ id, text, tags, target, updated, references }) => {
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
        content += `\n:PROPERTIES:\n:hid: ${id}\n:updated: ${updated}\n:END:`;

        return [id, { content, references }]
      }));
      // create tree
      let cleanup = [];
      for (const [id, block] of noteMap.entries()) {
        if (!block.references)
          continue;
        for (let i = block.references.length; i >= 0; i--) {
          let ref = noteMap.get(block.references[i]);
          if (ref) {
            if (!ref.children)
              ref.children = [];
            ref.children.push(block);
            cleanup.push(id);
            break;
          }
        }
      }
      // cleanup
      for (const id of cleanup)
        noteMap.delete(id);
      notes = [...noteMap.values()]
      console.warn(notes)

      return {title, notes}
    },
    async loadPageNotes(uri) {
      const name = 'hypothes.is_/' + uri.split('//')[1]
      logseq.App.pushState('page', { name })
      await delay(300)

      try {
        const page = await logseq.Editor.getCurrentPage();
        if (name !== page.originalName)
          throw new Error('page error');

        const pageBlocksTree = await logseq.Editor.getCurrentPageBlocksTree();
        console.warn(pageBlocksTree)
        let targetBlock = pageBlocksTree[0];
        targetBlock = await logseq.Editor.insertBlock(page.name, 'Loading annotations...', { isPageBlock: true })
        console.warn(targetBlock)

        let {title, notes} = this.getPageNotes(uri);

        await logseq.Editor.insertBatchBlock(targetBlock.uuid, notes, { sibling: true });

        await logseq.Editor.updateBlock(targetBlock.uuid, `[:a {:href "${uri}" :target "_blank" :class "external-link"} [:span {:class "icon-hypothesis forbid-edit"}] " ${title}"]`);
      } catch (e) {
        logseq.App.showMsg(e.toString(), 'warning');
        console.error(e);
      }
    },
  },
}
</script>
