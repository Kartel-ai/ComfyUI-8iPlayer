import { app } from '/scripts/app.js'
import { closeIcon } from './svg_icons.js'
import { api } from '/scripts/api.js'

import {
  GroupNodeConfig,
  GroupNodeHandler
} from '../../../extensions/core/groupNode.js'

import { smart_init, addSmartMenu } from './smart_connect.js'

import { completion_ } from './chat.js'

import {
  getLocalData,
  saveLocalData,
  updateLLMAPIKey,
  convertImageUrlToBase64,
  get_nodes_map,
  injectCSS,
  loadCSS,
  loadExternalScript
} from './common.js'

injectCSS(`
  .help_link {
    background: linear-gradient(rgb(110 110 110 / 50%), rgba(255, 255, 0, 0));
    background-size: 200% 200%;
    transition: background-position 0.5s;
    text-decoration: none;
  }

  .help_link:hover {
      background-position: right bottom;
  }`)

const BIZYAIR_SERVER_ADDRESS = 'https://api.siliconflow.cn'
const BIZYAIR_MODEL = '01-ai/Yi-1.5-9B-Chat-16K'

function showTextByLanguage (key, json) {
  // 获取浏览器语言
  var language = navigator.language
  // 判断是否为中文
  if (
    language.indexOf('zh') !== -1 ||
    (language.indexOf('cn') !== -1 && json[key])
  ) {
    return json[key]
  } else {
    return key
  }
}

//系统prompt
// const systemPrompt = `You are a prompt creator, your task is to create prompts for the user input request, the prompts are image descriptions that include keywords for (an adjective, type of image, framing/composition, subject, subject appearance/action, environment, lighting situation, details of the shoot/illustration, visuals aesthetics and artists), brake keywords by comas, provide high quality, non-verboose, coherent, brief, concise, and not superfluous prompts, the subject from the input request must be included verbatim on the prompt,the prompt is english`

const systemPrompt = `
Prompt:

Describe a scene with a specific theme in fluent and highly detailed English, focusing on the content and style. The description should be within 100 words.

Theme: [Insert Theme Here]

Example:

Theme: Sunset

The sun sets in a blaze of orange and pink, casting a warm glow over a tranquil lake. Silhouetted trees line the shore, their reflections shimmering in the water. A lone figure sits at the end of a wooden pier, feet dangling above the mirrored surface, lost in thought. The scene exudes peacefulness and quiet beauty.
`

if (!localStorage.getItem('_8i_system_prompt')) {
  localStorage.setItem('_8i_system_prompt', systemPrompt)
}

// 获取llama 模型
async function get_llamafile_models () {
  try {
    const response = await fetch('/8i/folder_paths', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'llamafile'
      })
    })

    const data = await response.json()
    // console.log(data)
    return data.names
  } catch (error) {
    console.error(error)
  }
}
// 运行llama
async function start_llama (model = 'Phi-3-mini-4k-instruct-Q5_K_S.gguf') {
  let n_gpu_layers = -1
  try {
    n_gpu_layers = parseInt(localStorage.getItem('_8i_llama_n_gpu'))
  } catch (error) {}

  try {
    const response = await fetch('/8i/start_llama', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        n_gpu_layers
      })
    })

    const data = await response.json()
    if (data.llama_cpp_error || !data.port) {
      return
    }

    return {
      url: `http://${window.location.hostname}:${data.port}`,
      model: data.model,
      chat_format: data.chat_format
    }
  } catch (error) {
    console.error(error)
  }
}

function resizeImage (base64Image) {
  var img = new Image()
  var canvas = document.createElement('canvas')
  var ctx = canvas.getContext('2d')
  return new Promise((res, rej) => {
    img.onload = function () {
      // 等比例缩放图片
      var width = img.width
      var height = img.height
      var max_width = 768
      if (width > max_width) {
        height *= max_width / width
        width = max_width
      }

      // 设置canvas尺寸
      canvas.width = width
      canvas.height = height

      // 在canvas上绘制图片
      ctx.drawImage(img, 0, 0, width, height)

      // 将canvas转换为base64图片数据
      var canvasData = canvas.toDataURL()
      res(canvasData) //  canvas转换后的base64图片数据
    }

    img.src = base64Image
  })
}

const createMixlabBtn = () => {
  const appsButton = document.createElement('button')
  appsButton.id = '8i_chatbot_by_llamacpp'
  appsButton.className = 'comfyui-button'
  appsButton.textContent = '♾️Mixlab'

  // appsButton.onclick = () =>
  appsButton.onclick = async () => {
    let llm_key = await updateLLMAPIKey()
    // if (window._8i_llamacpp&&window._8i_llamacpp.model&&window._8i_llamacpp.model.length>0) {
    //   //显示运行的模型
    //   createModelsModal([
    //     window._8i_llamacpp.url,
    //     window._8i_llamacpp.model
    //   ])
    // } else {
    //   // let ms = await get_llamafile_models()
    //   // ms = ms.filter(m => !m.match('-mmproj-'))
    //   // if (ms.length > 0) createModelsModal(ms)
    // }
    createModelsModal([], llm_key)
  }
  return appsButton
}

// 菜单入口
async function createMenu () {
  const menu = document.querySelector('.comfy-menu')
  const separator = document.createElement('div')
  separator.style = `margin: 20px 0px;
  width: 100%;
  height: 1px;
  background: var(--border-color);
  `
  menu.append(separator)

  if (
    menu.style.display === 'none' &&
    document.querySelector('.comfyui-menu-push')
  ) {
    //新版ui
    document.querySelector('.comfyui-menu-push').append(createMixlabBtn())
  } else {
    if (!menu.querySelector('#8i_chatbot_by_llamacpp')) {
      menu.append(createMixlabBtn())
    }
  }
}

let isScriptLoaded = {}

//

function createChart (chartDom, nodes) {
  var myChart = echarts.init(chartDom)
  var option

  console.log(nodes)
  option = {
    series: [
      {
        type: 'treemap',
        data: [
          {
            name: 'nodeA',
            value: 10,
            children: Array.from(nodes, n => {
              return {
                name: n.type,
                value: n.count
              }
            })
          }
        ]
      }
    ]
  }

  option && myChart.setOption(option)
}

async function createNodesCharts () {
  await loadExternalScript('/8i/app/lib/echarts.min.js')
  const templates = await loadTemplate()
  var nodes = {}
  Array.from(templates, t => {
    let j = JSON.parse(t.data)
    for (let node of j.nodes) {
      if (!nodes[node.type]) nodes[node.type] = { type: node.type, count: 0 }
      nodes[node.type].count++
    }
  })
  nodes = Object.values(nodes).sort((a, b) => b.count - a.count)

  const menu = document.querySelector('.comfy-menu')
  const separator = document.createElement('div')
  separator.style = `margin: 20px 0px;
  width: 100%;
  height: 1px;
  background: var(--border-color);
  `
  menu.append(separator)

  const appsButton = document.createElement('button')
  appsButton.textContent = 'Nodes'

  appsButton.onclick = () => {
    let div = document.querySelector('#8i_apps')
    if (!div) {
      div = document.createElement('div')
      div.id = '8i_apps'
      document.body.appendChild(div)

      let btn = document.createElement('div')
      btn.style = `display: flex;
     width: calc(100% - 24px);
     justify-content: space-between;
     align-items: center;
     padding: 0 12px;
     height: 44px;`
      let btnB = document.createElement('button')
      let textB = document.createElement('p')
      btn.appendChild(textB)
      btn.appendChild(btnB)
      textB.style.fontSize = '12px'
      textB.innerText = `Nodes`

      btnB.style = `float: right; border: none; color: var(--input-text);
     background-color: var(--comfy-input-bg); border-color: var(--border-color);cursor: pointer;`
      btnB.addEventListener('click', () => {
        div.style.display = 'none'
      })
      btnB.innerText = 'X'

      // 悬浮框拖动事件
      div.addEventListener('mousedown', function (e) {
        var startX = e.clientX
        var startY = e.clientY
        var offsetX = div.offsetLeft
        var offsetY = div.offsetTop

        function moveBox (e) {
          var newX = e.clientX
          var newY = e.clientY
          var deltaX = newX - startX
          var deltaY = newY - startY
          div.style.left = offsetX + deltaX + 'px'
          div.style.top = offsetY + deltaY + 'px'
          localStorage.setItem(
            '8i_app_pannel',
            JSON.stringify({ x: div.style.left, y: div.style.top })
          )
        }

        function stopMoving () {
          document.removeEventListener('mousemove', moveBox)
          document.removeEventListener('mouseup', stopMoving)
        }

        document.addEventListener('mousemove', moveBox)
        document.addEventListener('mouseup', stopMoving)
      })

      div.appendChild(btn)

      let chartDom = document.createElement('div')
      chartDom.style = `height:80vh;width:450px`
      chartDom.className = 'chart'
      div.appendChild(chartDom)
    }
    if (div.style.display == 'flex') {
      div.style.display = 'none'
    } else {
      let pos = JSON.parse(
        localStorage.getItem('8i_app_pannel') ||
          JSON.stringify({ x: 0, y: 0 })
      )

      div.style = `
      flex-direction: column;
      align-items: end;
      display:flex;
      position: absolute; 
      top: ${pos.y}; left: ${pos.x}; width: 450px; 
      color: var(--descrip-text);
      background-color: var(--comfy-menu-bg);
      padding: 10px; 
      border: 1px solid black;z-index: 999999999;padding-top: 0;`
    }

    createChart(div.querySelector('.chart'), nodes)
  }
  menu.append(appsButton)
}

function copyNodeValues (src, dest) {
  // title
  dest.title = src.title

  // copy input connections

  for (let i in src.inputs) {
    let input = src.inputs[i]
    if (input.link) {
      let link = app.graph.links[input.link]
      let src_node = app.graph.getNodeById(link.origin_id)
      if (dest.inputs.filter(inp => inp.name === input.name).length === 0) {
        // 没有，name换了
        let dInp = dest.inputs.filter(inp => inp.type === input.type)
        if (dInp.length === 1) {
          src_node.connect(link.origin_slot, dest.id, dInp[0].name)
        }
      } else {
        src_node.connect(link.origin_slot, dest.id, input.name)
      }
    }
  }

  // copy output connections
  let output_links = {}
  for (let i in src.outputs) {
    let output = src.outputs[i]
    if (output.links) {
      let links = []
      for (let j in output.links) {
        links.push(app.graph.links[output.links[j]])
      }
      output_links[output.name] = links
    }
  }

  for (let i in dest.outputs) {
    let links = output_links[dest.outputs[i].name]
    if (links) {
      for (let j in links) {
        let link = links[j]
        let target_node = app.graph.getNodeById(link.target_id)
        dest.connect(parseInt(i), target_node, link.target_slot)
      }
    }
  }

  // copy  widgets
  for (const w of src.widgets) {
    for (const d of dest.widgets) {
      if (w.name === d.name) {
        d.value = w.value
      }
    }
  }

  app.graph.afterChange()
}

function deepEqual (obj1, obj2) {
  if (typeof obj1 !== typeof obj2) {
    return false
  }

  if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) {
    return obj1 === obj2
  }

  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) {
    return false
  }

  for (let key of keys1) {
    if (!deepEqual(obj1[key], obj2[key])) {
      return false
    }
  }

  return true
}

function get_url () {
  let api_host = `${window.location.hostname}:${window.location.port}`
  let api_base = ''
  let url = `${window.location.protocol}//${api_host}${api_base}`
  return url
}

async function get_my_app (filename = null, category = '') {
  let url = get_url()
  let data = null

  try {
    const res = await fetch(`${url}/8i/workflow`, {
      method: 'POST',
      body: JSON.stringify({
        task: 'my_app',
        filename,
        category,
        admin: true
      })
    })
    let result = await res.json()

    data = []

    for (const res of result.data) {
      let { app, workflow } = res.data
      if (app?.filename)
        data.push({
          ...app,
          data: workflow,
          date: res.date
        })
    }
  } catch (error) {
    console.log(error)
  }
  return data
}

var cssURL =
  'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown-light.min.css'
loadCSS(cssURL)

injectCSS(`::-webkit-scrollbar {
  width: 2px;
}

#8i_chatbot_by_llamacpp{
  font-size:14px
}

#8i_chatbot_by_llamacpp::before {
  content: attr(title);
  position: absolute;
  margin-top: 24px;
  font-size: 10px;
}

.mix_tag{
  padding:8px;cursor: pointer;font-size: 14px;
    color: var(--input-text);
    background-color: var(--comfy-input-bg);
    border-radius: 8px;
    border-color: var(--border-color);
    border-style: solid;
    margin-top: 2px;
    margin-bottom: 14px;
}

.mix_tag:hover{
  background-color: #101c19;
  color: aquamarine;
}

@keyframes loading_8i {
  0% {
    background-color: green;
  }

  50% {
    background-color: lightgreen;
  }

  100% {
    background-color: green;
  }
}

.loading_8i {
  background-color: green;
  animation-name: loading_8i;
  animation-duration: 2s;
  animation-iteration-count: infinite;
}

.dynamic_prompt{
  border-left: 2px solid var(--input-text); 
}
 
`)

async function getCustomnodeMappings () {
  let nodes = {}
  if (!window._nodes_maps) {
    const data = (await get_nodes_map()).data
    window._nodes_maps = data
  }
  // console.log('#getCustomnodeMappings', window._nodes_maps)
  for (let url in window._nodes_maps) {
    let n = window._nodes_maps[url]
    for (let node of n[0]) {
      // if(node=='CLIPSeg')console.log('#CLIPSeg',n)
      nodes[node] = { url, title: n[1].title_aux }
    }
  }
  return nodes
}

const missingNodeGithub = (missingNodeTypes, nodesMap) => {
  let ts = {}

  Array.from(new Set(missingNodeTypes), n => {
    if (nodesMap[n]) {
      let title = nodesMap[n].title
      if (!ts[title]) {
        const link = nodesMap[n].url
        // 判断链接是否为GitHub仓库链接
        const githubRegex = /^https:\/\/github\.com\/(?:.*?\/)?([^/]+)\/.+$/

        const author = link.match(githubRegex)[1]
        console.log(`(作者: ${author})`)
        ts[title] = {
          title,
          nodes: {},
          url: link,
          author
        }
      }
      ts[title].nodes[n] = 1
    } else {
      ts[n] = {
        title: n,
        nodes: {},
        url: `https://github.com/search?q=${n}&type=code`
      }
      ts[n].nodes[n] = 1
    }
  })

  return Array.from(Object.values(ts), n => {
    const url = n.url
    return `<a 
      href="${url}" 
    target="_blank"
    title="${url}"
    style="color: white;
   padding: 8px;
   font-size: 16px;
   display: flex;
     flex-direction:${!n.author ? 'row' : 'column'};
    " 
    class="help_link"

    >${n.title}
    <div 
    style="display: flex; 
     flex-direction: row;
     align-items: center;
     ${!n.author ? 'line-height: 4px;' : ''}
    "
    >
   ${
     n.author
       ? `
      <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="24" height="24"/>
      <p style="line-height: 14px;
    color: white;
    margin-left: 12px;
}">Author:${n.author}</p>
      `
       : '🔍'
   }
  </div></a>`
  })
}

let nodesMap

// Enhanced navigation to GitHub for missing node search upon graph load.
// 更好地错误提示，找到GitHub原仓库地址
app.showMissingNodesError = async function (
  missingNodeTypes,
  hasAddedNodes = true
) {
  nodesMap =
    nodesMap && Object.keys(nodesMap).length > 0
      ? nodesMap
      : await getCustomnodeMappings()

  this.ui.dialog.show(
    `${showTextByLanguage(
      'When loading the graph, the following node types were not found:',
      {
        'When loading the graph, the following node types were not found:':
          '缺少以下节点：'
      }
    )}
  
   <ul class="comfy-missing-nodes">${missingNodeGithub(
     missingNodeTypes,
     nodesMap
   ).join('')}</ul>${hasAddedNodes ? '' : ''} 
   <br><br><a 
    style="color: #dedede;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 2px;
    font-family: sans-serif;
    text-decoration: none;
      "
    class="help_link"
    href="https://discord.gg/cXs9vZSqeK"  target="_blank">${showTextByLanguage(
      'Welcome to Mixlab nodes discord, seeking help.',
      {
        'Welcome to Mixlab nodes discord, seeking help.':
          '寻求帮助，加入Mixlab nodes交流频道'
      }
    )}</a>
    `
  )
  this.logging.addEntry('Comfy.App', 'warn', {
    MissingNodes: missingNodeTypes
  })
}

// 读取仓库说明
async function fetchReadmeContent (url) {
  try {
    // var repo = 'owner/repo'; // 仓库的拥有者和名称
    var match = url.match(/github.com\/([^/]+\/[^/]+)/)
    var repo = match[1]
    var url = `https://api.github.com/repos/${repo}/readme`
    var response = await fetch(url)
    var data = await response.json()
    var readmeUrl = data.download_url

    var readmeResponse = await fetch(readmeUrl)
    var content = await readmeResponse.text()
    // console.log(content) // 在控制台输出readme.md文件的内容

    return content
  } catch (error) {
    console.log('获取readme.md文件信息失败:', error)
  }
}

function createInputOfLabel (labelText, key, id) {
  const label = document.createElement('p')
  label.innerText = labelText

  const input = document.createElement('input')
  input.type = 'text'
  input.style = `color: var(--input-text);
  background-color: var(--comfy-input-bg);
  border-radius: 8px;
  border-color: var(--border-color);
  height: 26px;
  padding: 4px 10px;
  width: 150px;
  margin-left: 12px;`

  input.value =
    getLocalData(key)['-'] || Object.values(getLocalData(key))[0] || 'by Mixlab'

  input.addEventListener('change', e => {
    e.stopPropagation()
    e.preventDefault()

    saveLocalData(key, '-', input.value)
  })

  const div = document.createElement('div')
  div.style = `display: flex;
    justify-content: flex-start;
    align-items: baseline;padding: 0 18px;`

  div.addEventListener('click', e => {
    e.stopPropagation()
  })

  div.appendChild(label)
  div.appendChild(input)
  return div
}

function createModelsModal (models, llmKey) {
  var div =
    document.querySelector('#model-modal') || document.createElement('div')
  div.id = 'model-modal'
  div.innerHTML = ''
  div.style.cssText = `
    width: 100%;
    z-index: 9990;
    height: 100vh;
    display: flex;
    color: var(--descrip-text);
    position: fixed;
    top: 0;
    left: 0;
    background: #000000a8;
    `

  var modal = document.createElement('div')

  div.addEventListener('click', e => {
    e.stopPropagation()
    div.remove()
  })

  div.appendChild(modal)
  modal.classList.add('modal-body')
  // Set modal styles
  modal.style.cssText = `
  color: var(--descrip-text);
    background-color: var(--comfy-menu-bg);
    position: fixed;
    overflow:hidden;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999;
    border-radius: 4px;
    box-shadow: 4px 4px 14px rgba(255,255,255,0.2);
  `

  // Create modal header
  const headerElement = document.createElement('div')
  headerElement.classList.add('modal-header')
  headerElement.style.cssText = `
      display: flex;
      padding: 20px 24px 8px 24px;
      justify-content: space-between;
    `

  const headTitleElement = document.createElement('a')
  headTitleElement.classList.add('header-title')
  headTitleElement.style.cssText = `
      color: var(--descrip-text);
      font-size: 18px;
      display: flex;
      align-items: flex-start;
      flex: 1;
      overflow: hidden;
      text-decoration: none;
      font-weight: bold;
      justify-content: space-between;
      padding: 20px;
      cursor: pointer;
      user-select: none;
    `

  const linkIcon = document.createElement('small')
  linkIcon.textContent = showTextByLanguage('Auto Open', {
    'Auto Open': '自动开启'
  })
  linkIcon.style.padding = '4px'

  const statusIcon = document.createElement('small')
  statusIcon.textContent = showTextByLanguage('Status', {
    Status: 'OFF'
  })
  statusIcon.id = 'llm_status_btn'
  statusIcon.style = `padding: 4px;
  background-color: rgb(102, 255, 108);
  color: black;
  font-size: 12px;
  margin-left: 12px;`
  if (window._8i_llamacpp?.url) {
    statusIcon.textContent = window._8i_llamacpp.model
    statusIcon.style.backgroundColor = '#66ff6c'
    statusIcon.style.color = 'black'
  } else {
  }
  statusIcon.addEventListener('click', e => {
    e.stopPropagation()
    // startLLM()
  })

  const batchPageBtn = document.createElement('div')
  batchPageBtn.style = `display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;`
  batchPageBtn.innerHTML = `<a href="${get_url()}/8i/app" target="_blank" style="color: var(--input-text);
  background-color: var(--comfy-input-bg);font-size: 16px;">MixLab App</a>`

  const siliconflowHelp = document.createElement('a')
  siliconflowHelp.textContent =
    showTextByLanguage('Use Siliconflow', {
      'Use Siliconflow': '使用硅基流动'
    }) +
    '\n' +
    showTextByLanguage('Or Local LLM', {
      'Or Local LLM': '或者本地LLM'
    })
  siliconflowHelp.style = `color: var(--input-text);
  background-color: var(--comfy-input-bg);margin-top:14px;font-size: 16px;`
  siliconflowHelp.href = 'https://cloud.siliconflow.cn/s/8is'
  siliconflowHelp.target = '_blank'

  const title = document.createElement('p')
  title.innerText = 'Mixlab Nodes'
  title.style = `font-size: 18px;
  margin-right: 8px;
  margin-top: 0;`

  const left_d = document.createElement('div')
  left_d.style = `display: flex;
  justify-content: center;
  align-items: flex-start;
  font-size: 12px;
  flex-direction: column; `
  left_d.appendChild(title)
  left_d.appendChild(batchPageBtn)
  left_d.appendChild(siliconflowHelp)

  headTitleElement.appendChild(left_d)

  //重启
  const reStart = document.createElement('small')
  reStart.textContent = showTextByLanguage('restart', {
    restart: '重启'
  })

  reStart.style = `padding: 8px;
  font-size: 16px;
  outline: 1px solid;
  padding-top: 4px;
  padding-bottom: 4px;`

  headTitleElement.appendChild(reStart)

  if (localStorage.getItem('_8i_auto_llama_open')) {
    linkIcon.style.backgroundColor = '#66ff6c'
    linkIcon.style.color = 'black'
  }
  linkIcon.addEventListener('click', e => {
    e.stopPropagation()
    if (localStorage.getItem('_8i_auto_llama_open')) {
      localStorage.setItem('_8i_auto_llama_open', '')
      linkIcon.style.backgroundColor = ''
      linkIcon.style.color = 'var(--descrip-text)'
    } else {
      localStorage.setItem('_8i_auto_llama_open', 'true')
      linkIcon.style.backgroundColor = '#66ff6c'
      linkIcon.style.color = 'black'
    }
  })

  reStart.addEventListener('click', e => {
    e.stopPropagation()
    div.remove()
    fetch('8i/re_start', {
      method: 'POST'
    })
  })

  modal.appendChild(headTitleElement)

  // Create modal content area
  var modalContent = document.createElement('div')
  modalContent.classList.add('modal-content')

  let llmKeyDiv = createInputOfLabel('LLM Key', '_8i_llm_api_key', '-')

  if (!getLocalData('_8i_llm_api_url')['-']) {
    saveLocalData('_8i_llm_api_url', '-', BIZYAIR_SERVER_ADDRESS)
  }

  let llmAPIDiv = createInputOfLabel('LLM API', '_8i_llm_api_url', '-')

  if (!getLocalData('_8i_llm_model_name')['-']) {
    saveLocalData('_8i_llm_model_name', '-', BIZYAIR_MODEL)
  }

  let llmModelDiv = createInputOfLabel(
    'LLM Model',
    '_8i_llm_model_name',
    '-'
  )

  modalContent.appendChild(llmKeyDiv)
  modalContent.appendChild(llmAPIDiv)
  modalContent.appendChild(llmModelDiv)

  var inputForSystemPrompt = document.createElement('textarea')
  inputForSystemPrompt.className = 'comfy-multiline-input'
  inputForSystemPrompt.style = `height: 260px;width: 480px;font-size: 16px;padding: 18px;`
  inputForSystemPrompt.value = localStorage.getItem('_8i_system_prompt')

  inputForSystemPrompt.addEventListener('change', e => {
    e.stopPropagation()
    localStorage.setItem('_8i_system_prompt', inputForSystemPrompt.value)
  })

  inputForSystemPrompt.addEventListener('click', e => {
    e.stopPropagation()
  })

  modalContent.appendChild(inputForSystemPrompt)

  modal.appendChild(modalContent)

  const helpInfo = document.createElement('a')
  helpInfo.textContent = showTextByLanguage('Help', {
    Help: '寻求帮助'
  })
  helpInfo.style = `text-align: center;
  display: block;
  padding: 8px;
  cursor: pointer;
  font-size: 12px;
  color: white;`
  helpInfo.href = 'https://discord.gg/cXs9vZSqeK'
  helpInfo.target = '_blank'
  modal.appendChild(helpInfo)

  document.body.appendChild(div)
}

function createModal (url, markdown, title) {
  // Create modal element
  var div =
    document.querySelector('#mix-modal') || document.createElement('div')
  div.id = 'mix-modal'
  div.innerHTML = ''
  div.style.cssText = `
    width: 100%;
    z-index: 9990;
    height: 100vh;
    display: flex;
    color: var(--descrip-text);
    position: fixed;
    top: 0;
    left: 0;
    `

  var modal = document.createElement('div')

  div.appendChild(modal)
  modal.classList.add('modal-body')
  // Set modal styles
  modal.style.cssText = `
    background: white;
    height: 80vh;
    position: fixed;
    overflow:hidden;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999;
    border-radius: 4px;
    box-shadow: 4px 4px 14px rgba(255,255,255,0.5);

  `
  // Create modal content area
  var modalContent = document.createElement('div')
  modalContent.classList.add('modal-content')
  // Create modal header
  const headerElement = document.createElement('div')
  headerElement.classList.add('modal-header')
  headerElement.style.cssText = `
    display: flex;
    padding: 20px 24px 8px 24px;
    justify-content: space-between;
  `

  const headTitleElement = document.createElement('a')
  headTitleElement.classList.add('header-title')
  headTitleElement.style.cssText = `
    color: var(--descrip-text);
    font-size: 18px;
    display: flex;
    align-items: center;
    flex: 1;
    overflow: hidden;
    text-decoration: none;
    font-weight: bold;
  `
  headTitleElement.onmouseenter = function () {
    headTitleElement.style.color = 'var(--comfy-menu-bg)'
  }
  headTitleElement.onmouseleave = function () {
    headTitleElement.style.color = 'var(--descrip-text)'
  }
  headTitleElement.textContent = title || ''
  headTitleElement.href = url
  headTitleElement.target = '_blank'
  const linkIcon = document.createElement('small')
  linkIcon.textContent = '🔗'
  headTitleElement.appendChild(linkIcon)
  headerElement.appendChild(headTitleElement)

  // Create close button
  const closeButton = document.createElement('span')
  closeButton.classList.add('close')
  closeButton.innerHTML = closeIcon
  // Set close button styles
  closeButton.style.cssText = `
      padding: 4px;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      justify-content: center;
      align-items: center;
      user-select: none;
      fill: var(--descrip-text);
      `
  closeButton.onmouseenter = function () {
    closeButton.style.fill = 'var(--comfy-menu-bg)'
  }
  closeButton.onmouseleave = function () {
    closeButton.style.fill = 'var(--descrip-text)'
  }

  headerElement.appendChild(closeButton)

  // Click event to close the modal
  function closeMixModal () {
    div.style.display = 'none'
    window.removeEventListener('keydown', MixModalEscKeyEvent)
  }
  closeButton.onclick = function () {
    closeMixModal()
  }

  // Set modal content area styles
  modalContent.style.cssText = `
    position: relative;
    padding: 0px;
    overflow: hidden scroll;;
    height: 100%;
    min-width:300px
    `

  // Append close button to modal content area
  modal.appendChild(headerElement)

  // Create element for displaying Markdown content
  var markdownContent = document.createElement('div')
  markdownContent.classList.add('markdown-content', 'markdown-body')
  markdownContent.style.cssText = `max-width: 50vw;padding: 0px 24px 100px 24px;`

  showdown.setFlavor('github')
  var converter = new showdown.Converter()

  var html = converter.makeHtml(markdown)

  // Hide images in the markdown when they fail to load
  var regex = /<img[^>]+src="?([^"\s]+)"?[^>]*>/g
  html = html.replace(regex, function (match, src) {
    return `<img src="${src}" onerror="this.style.display='none'">`
  })

  // Open links in a new tab or window
  html = html.replace(/<a/g, '<a target="_blank"')

  // Fix href attribute to absolute path
  html = html.replace(
    /<a([^>]+href=["'])(?!https?:\/\/)([^"'>]+)/g,
    function (match, prefix, path) {
      var absolutePath = url + '/' + path
      return '<a' + prefix + absolutePath
    }
  )

  markdownContent.innerHTML = html

  // Append Markdown content element to modal content area
  modalContent.appendChild(markdownContent)

  // Append modal content area to modal element
  modal.appendChild(modalContent)

  const footerElement = document.createElement('div')
  footerElement.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      text-align: right;
      padding:10px;
      font-size:12px
  `

  const footerText = document.createElement('a')
  footerText.href = 'https://github.com/shadowcz007/comfyui-8i-nodes'
  footerText.innerText = 'Support by Mixlab'
  footerText.style.cssText = `color:inherit`
  footerText.target = '_blank'
  footerText.onmouseenter = function () {
    footerText.style.color = 'var(--input-text)'
  }
  footerText.onmouseleave = function () {
    footerText.style.color = 'inherit'
  }

  footerText.onclick = function (e) {
    e.stopPropagation()
  }
  footerElement.appendChild(footerText)

  div.appendChild(footerElement)

  // Append modal element to the page
  if (!document.querySelector('#mix-modal')) {
    document.body.appendChild(div)
  }
  function MixModalEscKeyEvent (event) {
    if (event.key == 'Escape') {
      closeMixModal()
    }
  }
  window.removeEventListener('keydown', MixModalEscKeyEvent)
  window.addEventListener('keydown', MixModalEscKeyEvent)

  const bgElement = document.createElement('div')
  bgElement.classList.add('mix-modal-bg')
  bgElement.style.cssText = `
    width:100%;
    height:100%;
    background-color: rgba(0,0,0,0.8);
  `
  bgElement.onclick = function () {
    closeMixModal()
  }

  div.appendChild(bgElement)
}

const loadTemplate = async () => {
  const id = 'Comfy.NodeTemplates'
  const file = 'comfy.templates.json'

  let templates = []
  if (app.storageLocation === 'server') {
    if (app.isNewUserSession) {
      // New user so migrate existing templates
      const json = localStorage.getItem(id)
      if (json) {
        templates = JSON.parse(json)
      }
      await api.storeUserData(file, json, { stringify: false })
    } else {
      const res = await api.getUserData(file)
      if (res.status === 200) {
        try {
          templates = await res.json()
        } catch (error) {}
      } else if (res.status !== 404) {
        console.error(res.status + ' ' + res.statusText)
      }
    }
  } else {
    const json = localStorage.getItem(id)
    if (json) {
      templates = JSON.parse(json)
    }
  }

  return templates ?? []
}

function drawBadge (node, orig, restArgs) {
  let ctx = restArgs[0]
  const r = orig?.apply?.(node, restArgs)

  if (
    !node.flags.collapsed &&
    node.constructor.title_mode != LiteGraph.NO_TITLE
  ) {
    let text = `#${node.id} `

    let nick = node.getNickname()
    if (nick) {
      if (nick == 'ComfyUI') {
        nick = '🦊'
      }

      if (nick.length > 25) {
        text += nick.substring(0, 23) + '..'
      } else {
        text += nick
      }
    }

    if (text != '') {
      let fgColor = 'white'
      let bgColor = '#0F1F0F'
      let visible = true

      ctx.save()
      ctx.font = '12px sans-serif'
      const sz = ctx.measureText(text)
      ctx.fillStyle = bgColor
      ctx.beginPath()
      ctx.roundRect(
        node.size[0] - sz.width - 12,
        -LiteGraph.NODE_TITLE_HEIGHT - 20,
        sz.width + 12,
        20,
        5
      )
      ctx.fill()

      ctx.fillStyle = fgColor
      ctx.fillText(
        text,
        node.size[0] - sz.width - 6,
        -LiteGraph.NODE_TITLE_HEIGHT - 6
      )
      ctx.restore()

      if (node.has_errors) {
        ctx.save()
        ctx.font = 'bold 14px sans-serif'
        const sz2 = ctx.measureText(node.type)
        ctx.fillStyle = 'white'
        ctx.fillText(
          node.type,
          node.size[0] / 2 - sz2.width / 2,
          node.size[1] / 2
        )
        ctx.restore()
      }
    }
  }
  return r
}

async function getSelectImageNode () {
  var nodes = app.canvas.selected_nodes
  let imageNode = null
  if (Object.keys(app.canvas.selected_nodes).length == 0) return
  for (var id in nodes) {
    if (nodes[id].imgs) {
      let base64 = await convertImageUrlToBase64(nodes[id].imgs[0].currentSrc)
      imageNode = await resizeImage(base64)
    }
  }
  return imageNode
}

app.registerExtension({
  name: 'Comfy.Mixlab.ui',
  init () {
    //是否要自动加载模型
    // if (localStorage.getItem('_8i_auto_llama_open')) {
    //   let model = localStorage.getItem('_8i_llama_select')
    //   start_llama(model).then(res => {
    //     window._8i_llamacpp = res
    //     document.body
    //       .querySelector('#8i_chatbot_by_llamacpp')
    //       .setAttribute('title', res.url)
    //   })
    // } else {
    //   // startLLM('')
    // }

    LGraphCanvas.prototype.helpAboutNode = async function (node) {
      nodesMap =
        nodesMap && Object.keys(nodesMap).length > 0
          ? nodesMap
          : await getCustomnodeMappings()

      console.log(
        '%c### node & node map',
        'background: yellow; color: black',
        node,
        nodesMap,
        nodesMap[node.type]
      )
      let repo = nodesMap[node.type]
      if (repo) {
        let markdown = await fetchReadmeContent(repo.url)
        await loadExternalScript('/8i/app/lib/showdown.min.js')
        createModal(repo.url, markdown, repo.title)
      }
    }

    LGraphCanvas.prototype.fixTheNode = function (node) {
      let new_node = LiteGraph.createNode(node.comfyClass)
      console.log(node)
      if (new_node) {
        new_node.pos = [node.pos[0], node.pos[1]]
        app.canvas.graph.add(new_node, false)
        copyNodeValues(node, new_node)
        app.canvas.graph.remove(node)
      }
    }

    smart_init()

    LGraphCanvas.prototype.text2text = async function (node) {
      let widget = node.widgets.filter(
        w =>
          (w.name === 'text' || w.name === 'prompt') &&
          typeof w.value == 'string'
      )[0]
      if (widget) {
        app.canvas.centerOnNode(node)

        let controller = new AbortController()
        let ends = [] //TODO 判断终止 <|im_start|>
        let userInput = widget.value
        widget.value = widget.value.trim()
        widget.value += '\n'
        let jsonStr = ''
        try {
          await completion_(
            getLocalData('_8i_llm_api_key')['-'] ||
              Object.values(getLocalData('_8i_llm_api_key'))[0],
            getLocalData('_8i_llm_api_url')['-'] ||
              Object.values(getLocalData('_8i_llm_api_url'))[0],
            getLocalData('_8i_llm_model_name')['-'] ||
              Object.values(getLocalData('_8i_llm_model_name'))[0],
            [
              {
                role: 'system',
                content: localStorage.getItem('_8i_system_prompt')
              },
              { role: 'user', content: userInput }
            ],
            controller,
            t => {
              let content = t.data?.choices[0]?.delta?.content || ''

              console.log(content)
              widget.value += content
              // jsonStr += content
            }
          )
        } catch (error) {
          console.log(error)
        }
      }
    }

    LGraphCanvas.prototype.image2text = async function (node) {
      let imageBase64 = await getSelectImageNode()

      if (imageBase64) {
        // console.log('image2text')
        // 添加note 节点
        const NoteNode = LiteGraph.createNode('Note')
        NoteNode.title = `Image-to-Text ${node.id}`
        NoteNode.size = [NoteNode.size[0] + 100, NoteNode.size[1]]
        let widget = NoteNode.widgets[0]
        widget.value = ''

        NoteNode.pos = [node.pos[0] + node.size[0] + 24, node.pos[1] - 48]

        app.canvas.graph.add(NoteNode, false)
        app.canvas.centerOnNode(NoteNode)

        let controller = new AbortController()
        let ends = []
        let userInput = widget.value
        widget.value = widget.value.trim()
        widget.value += '\n'

        try {
          // await completion_(
          //   window._8i_llamacpp.url + '/v1/chat/completions',
          //   [
          //     {
          //       role: 'system',
          //       content: localStorage.getItem('_8i_system_prompt')
          //     },
          //     // { role: 'user', content: userInput }
          //     {
          //       role: 'user',
          //       content: [
          //         {
          //           type: 'image_url',
          //           image_url: {
          //             url: imageBase64
          //           }
          //         },
          //         { type: 'text', text: 'What's in this image?' }
          //       ]
          //     }
          //   ],
          //   controller,
          //   t => {
          //     // console.log(t)
          //     widget.value += t
          //     NoteNode.size[1] = widget.element.scrollHeight + 20
          //     widget.computedHeight = NoteNode.size[1]
          //     app.canvas.centerOnNode(NoteNode)
          //   }
          // )
        } catch (error) {
          //是否要自动加载模型
          // if (localStorage.getItem('_8i_auto_llama_open')) {
          //   let model = localStorage.getItem('_8i_llama_select')
          //   start_llama(model).then(async res => {
          //     window._8i_llamacpp = res
          //     document.body
          //       .querySelector('#8i_chatbot_by_llamacpp')
          //       .setAttribute('title', res.url)
          //     await completion_(
          //       window._8i_llamacpp.url + '/v1/chat/completions',
          //       [
          //         {
          //           role: 'system',
          //           content: localStorage.getItem('_8i_system_prompt')
          //         },
          //         {
          //           role: 'user',
          //           content: [
          //             {
          //               type: 'image_url',
          //               image_url: {
          //                 url: imageBase64
          //               }
          //             },
          //             { type: 'text', text: 'What's in this image?' }
          //           ]
          //         }
          //       ],
          //       controller,
          //       t => {
          //         // console.log(t)
          //         widget.value += t
          //         NoteNode.size[1] = widget.element.scrollHeight + 20
          //         widget.computedHeight = NoteNode.size[1]
          //         app.canvas.centerOnNode(NoteNode)
          //       }
          //     )
          //   })
          // }
        }

        widget.value = widget.value.trim()
      }
    }

    const getGroupMenuOptions = LGraphCanvas.prototype.getGroupMenuOptions // store the existing method
    LGraphCanvas.prototype.getGroupMenuOptions = function (node) {
      // replace it
      const options = getGroupMenuOptions.apply(this, arguments) // start by calling the stored one
      node.setDirtyCanvas(true, true) // force a redraw of (foreground, background)

      return [
        {
          content: 'Clone Group ♾️Mixlab', // with a name
          callback: async (value, opts, e, menu, group) => {
            const clipboardAction = async cb => {
              // We use the clipboard functions but dont want to overwrite the current user clipboard
              // Restore it after we've run our callback
              const old = localStorage.getItem('litegrapheditor_clipboard')
              await cb()
              localStorage.setItem('litegrapheditor_clipboard', old)
            }

            clipboardAction(async () => {
              let name = group.title
              let nodes = group._nodes

              app.canvas.copyToClipboard(nodes)
              let data = localStorage.getItem('litegrapheditor_clipboard')
              data = JSON.parse(data)

              for (let i = 0; i < nodes.length; i++) {
                const node = app.graph.getNodeById(nodes[i].id)
                const nodeData = node.serialize()

                let groupData = GroupNodeHandler.getGroupData(node)
                if (groupData) {
                  groupData = groupData.nodeData
                  if (!data.groupNodes) {
                    data.groupNodes = {}
                  }
                  data.groupNodes[nodeData.name] = groupData
                  data.nodes[i].type = nodeData.name
                }
              }

              await GroupNodeConfig.registerFromWorkflow(data.groupNodes, {})
              localStorage.setItem(
                'litegrapheditor_clipboard',
                JSON.stringify(data)
              )
              app.canvas.pasteFromClipboard()
            })
          } // and the callback
        },
        {
          content: 'Save Group as Template ♾️Mixlab', // with a name
          callback: async (value, opts, e, menu, group) => {
            // console.log(options)

            const clipboardAction = async cb => {
              // We use the clipboard functions but dont want to overwrite the current user clipboard
              // Restore it after we've run our callback
              const old = localStorage.getItem('litegrapheditor_clipboard')
              await cb()
              localStorage.setItem('litegrapheditor_clipboard', old)
            }

            clipboardAction(async () => {
              let name = group.title + ' ♾️Mixlab'
              let nodes = group._nodes

              app.canvas.copyToClipboard(nodes)
              let data = localStorage.getItem('litegrapheditor_clipboard')
              data = JSON.parse(data)

              for (let i = 0; i < nodes.length; i++) {
                const node = app.graph.getNodeById(nodes[i].id)
                const nodeData = node.serialize()

                let groupData = GroupNodeHandler.getGroupData(node)

                // console.log('groupData',GroupNodeHandler.isGroupNode(node),groupData)
                if (groupData) {
                  groupData = groupData.nodeData
                  if (!data.groupNodes) {
                    data.groupNodes = {}
                  }
                  data.groupNodes[nodeData.name] = groupData
                  data.nodes[i].type = nodeData.name
                }
              }

              // templete
              const store = async nt => {
                const id = 'Comfy.NodeTemplates'
                const file = 'comfy.templates.json'
                let templates = await loadTemplate()
                templates.push(nt)
                if (app.storageLocation === 'server') {
                  const ts = JSON.stringify(templates, undefined, 4)
                  localStorage.setItem(id, ts) // Backwards compatibility
                  try {
                    await api.storeUserData(file, ts, {
                      stringify: false
                    })
                  } catch (error) {
                    console.error(error)
                    alert(error.message)
                  }
                } else {
                  localStorage.setItem(id, JSON.stringify(templates))
                }
              }
              console.log('data', data)
              store({
                name,
                data: JSON.stringify(data)
              })
            })
          } // and the callback
        },
        {
          content: `Remove Group&Nodes ♾️Mixlab`, // with a name
          callback: async (value, opts, e, menu, group) => {
            // console.log(group)
            let nodes = group._nodes
            for (const node of nodes) {
              app.graph.remove(node)
            }
            app.graph.remove(group)
          } // and the callback
        },
        null,
        ...options
      ] // and return the options
    }
    LGraphCanvas.prototype.centerOnNode = function (node) {
      // console.log(node)
      var dpr = window.devicePixelRatio || 1 // 获取设备像素比
      this.ds.offset[0] =
        -node.pos[0] -
        node.size[0] * 0.5 +
        (this.canvas.width * 0.5) / (this.ds.scale * dpr) // 考虑设备像素比
      this.ds.offset[1] =
        -node.pos[1] -
        node.size[1] * 0.5 +
        (this.canvas.height * 0.5) / (this.ds.scale * dpr) // 考虑设备像素比
      this.setDirty(true, true)
    }

    const getNodeMenuOptions = LGraphCanvas.prototype.getNodeMenuOptions
    LGraphCanvas.prototype.getNodeMenuOptions = function (node) {
      // replace it
      const options = getNodeMenuOptions.apply(this, arguments) // start by calling the stored one
      node.setDirtyCanvas(true, true) // force a redraw of (foreground, background)

      let opts = [
        {
          content: 'Help ♾️Mixlab', // with a name
          callback: () => {
            // console.log('#data',node)
            LGraphCanvas.prototype.helpAboutNode(node)
          } // and the callback
        },
        {
          content: 'Fix node v2', // with a name
          callback: () => {
            LGraphCanvas.prototype.fixTheNode(node)
          }
        }
      ]

      if (node.widgets) {
        let text_widget = node.widgets.filter(
          w =>
            (w.name === 'text' || w.name === 'prompt') &&
            typeof w.value == 'string'
        )

        let text_input = node.inputs?.filter(
          inp => inp.name == 'text' && inp.type == 'STRING'
        )

        const llm_api_key =
            getLocalData('_8i_llm_api_key')['-'] ||
            Object.values(getLocalData('_8i_llm_api_key'))[0],
          llm_api_url =
            getLocalData('_8i_llm_api_url')['-'] ||
            Object.values(getLocalData('_8i_llm_api_url'))[0]

        if (
          text_widget &&
          text_widget.length == 1 &&
          llm_api_key &&
          llm_api_url &&
          node.type != 'ShowTextForGPT'
        ) {
          opts.push({
            content: 'Text-to-Text ♾️Mixlab', // with a name
            callback: () => {
              LGraphCanvas.prototype.text2text(node)
            } // and the callback
          })
        }

        // if (
        //   node.imgs &&
        //   node.imgs.length > 0 &&
        //   window._8i_llamacpp &&
        //   window._8i_llamacpp.chat_format === 'llava-1-5'
        // ) {
        //   opts.push({
        //     content: 'Image-to-Text ♾️Mixlab', // with a name
        //     callback: () => {
        //       LGraphCanvas.prototype.image2text(node)
        //     } // and the callback
        //   })
        // }
      }

      return [...opts, null, ...options] // and return the options
    }

    // 支持app模式的json
    const loadAppJson = async data => {
      let workflow
      try {
        let w = JSON.parse(data)
        if (w.app && w.output) workflow = w.workflow
      } catch (err) {}

      if (workflow && workflow.version && workflow.nodes && workflow.extra) {
        await app.loadGraphData(workflow)
      }
    }

    if (!window._8i_app_paste_listener) {
      window._8i_app_paste_listener = true
      //粘贴json的事件
      document.addEventListener('paste', async e => {
        // ctrl+shift+v is used to paste nodes with connections
        // this is handled by litegraph
        if (this.shiftDown) return

        let data = e.clipboardData || window.clipboardData

        // No image found. Look for node data
        data = data.getData('text/plain')

        loadAppJson(data)
      })

      // 把json往里 拖
      document.addEventListener('drop', async event => {
        event.preventDefault()
        event.stopPropagation()

        // Dragging from Chrome->Firefox there is a file but its a bmp, so ignore that
        if (
          event.dataTransfer.files.length &&
          event.dataTransfer.files[0].type == 'application/json'
        ) {
          const reader = new FileReader()
          reader.onload = async () => {
            loadAppJson(reader.result)
          }
          reader.readAsText(event.dataTransfer.files[0])
        }
      })
    }

    createMenu()
  },
  setup () {
    setTimeout(async () => {
      // Add canvas menu options
      const orig = LGraphCanvas.prototype.getCanvasMenuOptions

      // const apps = await get_my_app()
      // if (!apps) return

      // console.log('apps', apps)

      // let apps_map = { 0: [] }

      // for (const app of apps) {
      //   if (app.category) {
      //     if (!apps_map[app.category]) apps_map[app.category] = []
      //     apps_map[app.category].push(app)
      //   } else {
      //     apps_map['0'].push(app)
      //   }
      // }

      let apps_opts = []
      // for (const category in apps_map) {
      //   // console.log('category', typeof category)
      //   if (category === '0') {
      //     apps_opts.push(
      //       ...Array.from(apps_map[category], a => {
      //         // console.log('#1级',a)
      //         return {
      //           content: `${a.name}_${a.version}`,
      //           has_submenu: false,
      //           callback: async () => {
      //             try {
      //               let ddd = await get_my_app(a.filename)
      //               if (!ddd) return
      //               let item = ddd[0]
      //               if (item) {
      //                 if (item.author) {
      //                   // 有作者信息
      //                   if (item.author.avatar)
      //                     localStorage.setItem(
      //                       '_8i_author_avatar',
      //                       item.author.avatar
      //                     )
      //                   if (item.author.name)
      //                     localStorage.setItem(
      //                       '_8i_author_name',
      //                       item.author.name
      //                     )

      //                   if (item.author.link)
      //                     localStorage.setItem(
      //                       '_8i_author_link',
      //                       item.author.link
      //                     )
      //                 }

      //                 // console.log(item.data)
      //                 app.loadGraphData(item.data)
      //                 setTimeout(() => {
      //                   const node = app.graph._nodes_in_order[0]
      //                   if (!node) return
      //                   app.canvas.centerOnNode(node)
      //                   app.canvas.setZoom(0.5)
      //                 }, 1000)
      //               }
      //             } catch (error) {}
      //           }
      //         }
      //       })
      //     )
      //   } else {
      //     // 二级
      //     apps_opts.push({
      //       content: '🚀 ' + category,
      //       has_submenu: true,
      //       disabled: false,
      //       submenu: {
      //         options: Array.from(apps_map[category], a => {
      //           // console.log('#二级',a)
      //           return {
      //             content: `${a.name}_${a.version}`,
      //             callback: async () => {
      //               try {
      //                 let ddd = await get_my_app(a.filename, a.category)

      //                 if (!ddd) return
      //                 let item = ddd[0]
      //                 if (item) {
      //                   console.log(item)
      //                   if (item.author) {
      //                     // 有作者信息
      //                     if (item.author.avatar)
      //                       localStorage.setItem(
      //                         '_8i_author_avatar',
      //                         item.author.avatar
      //                       )
      //                     if (item.author.name)
      //                       localStorage.setItem(
      //                         '_8i_author_name',
      //                         item.author.name
      //                       )
      //                     if (item.author.link)
      //                       localStorage.setItem(
      //                         '_8i_author_link',
      //                         item.author.link
      //                       )
      //                   }

      //                   // console.log(item.data)
      //                   app.loadGraphData(item.data)
      //                   setTimeout(() => {
      //                     const node = app.graph._nodes_in_order[0]
      //                     if (!node) return
      //                     app.canvas.centerOnNode(node)
      //                     app.canvas.setZoom(0.5)
      //                   }, 1000)
      //                 }
      //               } catch (error) {}
      //             }
      //           }
      //         })
      //       }
      //     })
      //   }
      // }

      // console.log('apps',apps_map, apps_opts,apps)
      LGraphCanvas.prototype.getCanvasMenuOptions = function () {
        const options = orig.apply(this, arguments)

        options.push(
          null,
          {
            content: `Nodes Map ♾️Mixlab`,
            disabled: false,
            callback: async () => {
              nodesMap =
                nodesMap && Object.keys(nodesMap).length > 0
                  ? nodesMap
                  : await getCustomnodeMappings()

              const nodesDiv = document.createDocumentFragment()
              const nodes = (await app.graphToPrompt()).output

              // console.log('[Mixlab]', 'loaded graph node: ', app)
              let div =
                document.querySelector('#8i_find_the_node') ||
                document.createElement('div')
              div.id = '8i_find_the_node'
              div.style = `
               flex-direction: column;
               align-items: end;
               display:flex;position: absolute; 
               top: 50px; left: 50px; width: 200px; 
               color: var(--descrip-text);
               background-color: var(--comfy-menu-bg);
               padding: 10px; 
               border: 1px solid black;z-index: 999999999;padding-top: 0;`

              div.innerHTML = ''

              let btn = document.createElement('div')
              btn.style = `display: flex;
             width: calc(100% - 24px);
             justify-content: space-between;
             align-items: center;
             padding: 0 12px;
             height: 44px;`
              let btnB = document.createElement('button')
              let textB = document.createElement('p')
              btn.appendChild(textB)
              btn.appendChild(btnB)
              textB.style.fontSize = '12px'
              textB.innerText = `Locate and navigate nodes ♾️Mixlab`

              btnB.style = `float: right; border: none; color: var(--input-text);
             background-color: var(--comfy-input-bg); border-color: var(--border-color);cursor: pointer;`
              btnB.addEventListener('click', () => {
                div.style.display = 'none'
              })
              btnB.innerText = 'X'

              // 悬浮框拖动事件
              div.addEventListener('mousedown', function (e) {
                var startX = e.clientX
                var startY = e.clientY
                var offsetX = div.offsetLeft
                var offsetY = div.offsetTop

                function moveBox (e) {
                  var newX = e.clientX
                  var newY = e.clientY
                  var deltaX = newX - startX
                  var deltaY = newY - startY
                  div.style.left = offsetX + deltaX + 'px'
                  div.style.top = offsetY + deltaY + 'px'
                }

                function stopMoving () {
                  document.removeEventListener('mousemove', moveBox)
                  document.removeEventListener('mouseup', stopMoving)
                }

                document.addEventListener('mousemove', moveBox)
                document.addEventListener('mouseup', stopMoving)
              })

              div.appendChild(btn)

              const updateNodes = (ns, nd) => {
                let appInfoNodes = {}
                try {
                  let appInfo = app.graph._nodes.filter(
                    n => n.type === 'AppInfo'
                  )[0]
                  if (appInfo) {
                    appInfoNodes[appInfo.id] = 2
                    for (const id of appInfo.widgets[1].value.split('\n')) {
                      if (id && id.trim() && parseInt(id)) {
                        appInfoNodes[id] = 0
                      }
                    }
                    for (const id of app.graph._nodes
                      .filter(n => n.type === 'AppInfo')[0]
                      .widgets[2].value.split('\n')) {
                      if (id && id.trim() && parseInt(id)) {
                        appInfoNodes[id] = 1
                      }
                    }
                  }
                } catch (error) {
                  console.log(error)
                }

                for (let nodeId in ns) {
                  let n = ns[nodeId].title || ns[nodeId].class_type
                  if (nodesMap[n]) {
                    const { url, title } = nodesMap[n]
                    let d = document.createElement('button')
                    d.style = `text-align: left;
                    margin:6px;
                    color: var(--input-text);
                   background-color: var(--comfy-input-bg); 
                   border-color: ${
                     appInfoNodes[nodeId] >= 0
                       ? appInfoNodes[nodeId] === 1
                         ? 'blue'
                         : 'red'
                       : 'var(--border-color)'
                   };
                   cursor: pointer;`

                    if (appInfoNodes[nodeId] === 2) {
                      // appinfo
                      d.style.backgroundColor = '#326328'
                      d.style.color = '#ffffff'
                      d.style.borderColor = 'transparent'
                    }

                    d.addEventListener('click', () => {
                      // console.log('node')
                      const node = app.graph.getNodeById(nodeId)

                      if (!node) return
                      app.canvas.centerOnNode(node)
                      app.canvas.setZoom(1)
                    })
                    d.addEventListener('mouseover', async () => {
                      // console.log('mouseover')
                      let n = (await app.graphToPrompt()).output
                      if (!deepEqual(n, ns)) {
                        nd.innerHTML = ''
                        updateNodes(n, nd)
                      }
                    })

                    d.innerHTML = `
                   <span>${'#' + nodeId} ${n}</span>
                   <a href="${url}" target="_blank" style="text-decoration: none;">🔗</a>
                   `
                    d.title = title

                    nd.appendChild(d)
                  }
                }
              }

              let nodesDivv = document.createElement('div')
              let appInfoNodes = {}
              try {
                let appInfo = app.graph._nodes.filter(
                  n => n.type === 'AppInfo'
                )[0]
                if (appInfo) {
                  appInfoNodes[appInfo.id] = 2
                  for (const id of appInfo.widgets[1].value.split('\n')) {
                    if (id && id.trim() && parseInt(id)) {
                      appInfoNodes[id] = 0
                    }
                  }
                  for (const id of app.graph._nodes
                    .filter(n => n.type === 'AppInfo')[0]
                    .widgets[2].value.split('\n')) {
                    if (id && id.trim() && parseInt(id)) {
                      appInfoNodes[id] = 1
                    }
                  }
                }
              } catch (error) {
                console.log(error)
              }

              for (let nodeId in nodes) {
                let n = nodes[nodeId].class_type
                if (nodesMap[n]) {
                  const { url, title: _title } = nodesMap[n]
                  let title = app.graph.getNodeById(nodeId).title || _title
                  let d = document.createElement('button')
                  d.style = `text-align: left;
                  margin:6px;
                  color: var(--input-text);
                 background-color: var(--comfy-input-bg); 
                 border-color: ${
                   appInfoNodes[nodeId] >= 0
                     ? appInfoNodes[nodeId] === 1
                       ? 'blue'
                       : 'red'
                     : 'var(--border-color)'
                 };
                 cursor: pointer;`

                  if (appInfoNodes[nodeId] === 2) {
                    // appinfo
                    d.style.backgroundColor = '#326328'
                    d.style.color = '#ffffff'
                    d.style.borderColor = 'transparent'
                  }

                  d.addEventListener('click', () => {
                    console.log('click')
                    const node = app.graph.getNodeById(nodeId)
                    if (!node) return
                    app.canvas.centerOnNode(node)
                    app.canvas.setZoom(1)
                  })
                  d.addEventListener('mouseover', async () => {
                    // console.log('mouseover')
                    let n = (await app.graphToPrompt()).output
                    if (!deepEqual(n, nodes)) {
                      nodesDivv.innerHTML = ''
                      updateNodes(n, nodesDivv)
                    }
                  })

                  d.innerHTML = `
                 <span>${'#' + nodeId} ${title}</span>
                 <a href="${url}" target="_blank" style="text-decoration: none;">🔗</a>
                 `
                  d.title = n

                  nodesDiv.appendChild(d)
                }
              }

              nodesDivv.appendChild(nodesDiv)
              nodesDivv.style = `overflow: scroll;
             height: 70vh;width: 100%;`

              div.appendChild(nodesDivv)

              if (!document.querySelector('#8i_find_the_node'))
                document.body.appendChild(div)
            }
          },
          apps_opts.length > 0
            ? {
                content: 'Workflow App ♾️Mixlab',
                has_submenu: true,
                disabled: false,
                submenu: {
                  options: apps_opts
                }
              }
            : null
        )

        return options
      }
    }, 1000)

    // createNodesCharts()
  },
  nodeCreated (node) {
    if (node.widgets) {
      // Locate dynamic prompt text widgets
      // Include any widgets with dynamicPrompts set to true, and customtext

      for (let index = 0; index < node.widgets.length; index++) {
        const widget = node.widgets[index]
        if (
          (widget.type === 'customtext' && widget.dynamicPrompts !== false) ||
          widget.dynamicPrompts
        ) {
          widget.element.classList.add('dynamic_prompt')

          widget.element.addEventListener('mouseover', e => {
            // console.log(node.widgets_values[index])
            if (node.widgets_values && node.widgets_values[index])
              widget.element.setAttribute('title', node.widgets_values[index])
          })
        }
      }
    }

    fetch('manager/badge_mode').then(r => {
      if (r.status === 404) {
        // 已有ComfyUI自带的badge
        if(node.badges?.[0]?.()){
          return
        }
        // 右上角的badge是否已经绘制
        if (!node.badge_enabled) {
          if (!node.getNickname) {
            node.getNickname = function () {
              if (node.nickname) {
                return node.nickname
              }
              return
              // return getNickname(node, node.comfyClass.trim())
            }
          }

          const orig = node.__proto__.onDrawForeground
          node.onDrawForeground = function (ctx) {
            drawBadge(node, orig, arguments)
          }
          node.badge_enabled = true
        }
      }
    })
  },
  async loadedGraphNode (node, app) {
    // console.log(
    //   '#ui init',
    //   app.graph._nodes[app.graph._nodes.length - 1].id,
    //   node.id
    // )
    try {
      // 用来居中显示节点
      if ((app.graph._nodes[app.graph._nodes.length - 1].id, node.id)) {
        app.canvas.centerOnNode(node)
        app.canvas.setZoom(0.45)
      }
    } catch (error) {}
  }
})

//获取当前显存
function fetchSystemStats () {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch('/system_stats')
      const data = await response.json()
      resolve(data)
    } catch (error) {
      reject(error)
    }
  })
}
//清理显存
function postFreeData () {
  return new Promise(async (resolve, reject) => {
    try {
      const postData = {
        unload_models: true,
        free_memory: true
      }
      const response = await fetch('/free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
      })
      if (response.ok) {
        resolve()
      } else {
        reject(new Error('Request failed'))
      }
    } catch (error) {
      reject(error)
    }
  })
}
