# Logseq Hypothes.is Plugin
![hypo](https://user-images.githubusercontent.com/80478/130854045-ac8c603f-0e07-4531-b195-c15833475052.jpg)

Enter your [API token](https://hypothes.is/account/developer) and user address. If you are not using a third party hypothes.is provider, your user account is `username@hypothes.is`. `Fetch Updates` will fetch new [hypothes.is](https://web.hypothes.is/) notes.

Selecting an URI below and clicking `Get Selected Page` will gather notes and create a page.

Types of notes

- 📌 **highlight**
- 📝
  - **annotation** - if under an highlight
  - **reply** - if a child
  - **page note** - if not a child
- 🗑️ *deleted* note

### Running the Plugin

- `npm install && npm run build` in terminal to install dependencies.
- `Load unpacked plugin` in Logseq Desktop client.
