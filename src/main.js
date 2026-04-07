import { createApp } from 'vue'
import App from './App.vue'
import { installRouteBridge } from './router/route-store'
import './services/notifications/bootstrap'

installRouteBridge()
createApp(App).mount('#vue-root')
