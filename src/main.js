import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/theme.css'
import './style.css'
import App from './App.vue'
// <dotrino-support> y <dotrino-back> los trae <dotrino-topbar> (§5): no se
// importan ni se montan aparte. Aquí solo queda <dotrino-profile>, que la app
// usa por su cuenta (perfil propio con ELO + tarjeta del rival).
import '@dotrino/profile'
import '@dotrino/share'
import { createBackNav } from '@dotrino/nav'

// Navegación "volver" unificada del ecosistema (botón físico de Android / gesto
// de iOS / atrás del navegador / chevron del header → cierra modal, vuelve del
// juego al lobby; si no hay nada → dotrino.com).
createBackNav()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
