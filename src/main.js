import { createApp } from 'vue'
import App from './App.vue'
// Shared, unscoped control styles (range sliders, brush cursor guide). Imported
// here rather than from a component because several components render the same
// controls and scoped styles cannot reach across a component boundary.
import './styles/viewport-controls.css'

createApp(App).mount('#app')
