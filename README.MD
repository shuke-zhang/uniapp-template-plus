
**在使用pnpm时，请注意node需使用 18.18.0 其他版本会出现预料之外的错误**
**本项目采用pnpm 请`npm i -g pnpm`**
**pnpm版本请尽量使用10.0.0版本以下。否则会出现ESM的报错**
1. 采用 vscode 开发 
2. `pnpm dev:mp-wx` 打开微信开发者工具导入 dist/dev/mp-weixin 即可运行微信小程序
3. 使用页面插件`@uni-helper/vite-plugin-uni-pages`可直接配置页面路径，不需要在pages.json中统一配置 ===> https://uni-helper.js.org/vite-plugin-uni-pages
4. 使用css预处理器插件`unocss-preset-uni` 官方配置文档 ===> https://uni-helper.js.org/unocss-preset-uni
   >  由于unocss会解读某些属性导致自定义组件传递参数失效，所以我们要在uno.config.ts忽略他们。https://unocss.net/presets/attributify#%E5%B1%9E%E6%80%A7%E5%86%B2%E7%AA%81
   >  为了更好的支持使用 需要安装扩展 UnoCSS 
   >  unocss交互式文档，可直接搜索相关css简写 https://unocss.dev/interactive/ 
5. iconfont 图标库需要加入项目请联系管理员 - https://www.iconfont.cn/manage/index?manage_type=myprojects&projectId=4837513
   > 更换icon图标库  - 进入在线项目点击 **下载至本地** 将下载的文件放置在 **scripts/__iconfont** 目录下即可


2026年2月24日 
   由于 **@uni-helper/vite-plugin-uni-tailwind** 已经正式废弃 https://github.com/uni-helper/vite-plugin-uni-tailwind?tab=readme-ov-file 
   所以将css插件更新为 **unocss-preset-uni** - https://uni-helper.js.org/unocss-preset-uni
   **需要在 main.ts 中插入代码 `import 'uno.css'`** 
