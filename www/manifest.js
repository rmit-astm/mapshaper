// Dynamically get the base URL to ensure file paths work in localhost and also when uploaded to Amplify
const baseURL = window.location.origin; 

mapshaper.manifest = {
  files: [
    `${baseURL}/mapshaper/data/network - links.zip`
  ],
  quick_view: true,
  commands: "-classify field=cycleway save-as=stroke colors='#bdbdbd,#eda100,#eb6834,#2a78d6,#e34948,#1baf7a,#008300'"
};