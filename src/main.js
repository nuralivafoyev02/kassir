import { createApp } from 'vue'
import App from './App.vue'
import { installRouteBridge } from './router/route-store'

installRouteBridge()
createApp(App).mount('#vue-root')
