import { createApp } from 'vue'
import './styles.css'

import App from './App.vue'
import router from './router'

import Button from 'vant/es/button'
import 'vant/es/button/style'
import ConfigProvider from 'vant/es/config-provider'
import 'vant/es/config-provider/style'
import Cell from 'vant/es/cell'
import 'vant/es/cell/style'
import CellGroup from 'vant/es/cell-group'
import 'vant/es/cell-group/style'
import Checkbox from 'vant/es/checkbox'
import 'vant/es/checkbox/style'
import CheckboxGroup from 'vant/es/checkbox-group'
import 'vant/es/checkbox-group/style'
import Empty from 'vant/es/empty'
import 'vant/es/empty/style'
import Field from 'vant/es/field'
import 'vant/es/field/style'
import Form from 'vant/es/form'
import 'vant/es/form/style'
import Icon from 'vant/es/icon'
import 'vant/es/icon/style'
import Loading from 'vant/es/loading'
import 'vant/es/loading/style'
import NavBar from 'vant/es/nav-bar'
import 'vant/es/nav-bar/style'
import NoticeBar from 'vant/es/notice-bar'
import 'vant/es/notice-bar/style'
import Progress from 'vant/es/progress'
import 'vant/es/progress/style'
import Popup from 'vant/es/popup'
import 'vant/es/popup/style'
import Search from 'vant/es/search'
import 'vant/es/search/style'
import Tabbar from 'vant/es/tabbar'
import 'vant/es/tabbar/style'
import TabbarItem from 'vant/es/tabbar-item'
import 'vant/es/tabbar-item/style'
import Tag from 'vant/es/tag'
import 'vant/es/tag/style'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'

const app = createApp(App)

const components = [
  Button,
  ConfigProvider,
  Cell,
  CellGroup,
  Checkbox,
  CheckboxGroup,
  Empty,
  Field,
  Form,
  Icon,
  Loading,
  NavBar,
  NoticeBar,
  Progress,
  Popup,
  Search,
  Tabbar,
  TabbarItem,
  Tag,
]

components.forEach((component) => app.use(component))

app.use(router).mount('#app')
