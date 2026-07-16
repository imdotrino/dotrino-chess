// Tutorial guiado del Ajedrez (burbujas tipo donar/compartir) con el paquete
// compartido @dotrino/tutorial. Explica cómo CREAR una mesa
// (pública/privada), UNIRSE con un código, ver las mesas públicas, COMPARTIR/
// invitar al rival y dónde vive tu identidad. La app tiene dos vistas
// (currentView 'lobby' | 'game'), sin menú: los pasos del lobby fuerzan la vista
// lobby y el de compartir se gatea con skipIf hasta que estás en una partida.
import { createTutorial } from '@dotrino/tutorial'

let instance = null

export function startAppTutorial (ctx) {
  if (instance) return instance
  const goLobby = () => ctx.goLobby()
  instance = createTutorial({
    lang: ctx.lang(),
    storageKey: 'chess.tutorial',
    startDelay: 900,
    stepTimeout: 4000,
    steps: [
      {
        id: 'create', order: 1, placement: 'bottom',
        target: '[data-testid="create-game"]',
        before: goLobby,
        title: { es: 'Crear una partida', en: 'Create a game' },
        text: {
          es: 'Elige si tu mesa es pública (sale en la lista) o privada (solo con tu enlace) y pulsa Crear partida para abrir el tablero y esperar rival.',
          en: 'Choose public (listed) or private (link only) and tap Create game to open the board and wait for an opponent.',
        },
      },
      {
        id: 'join', order: 2, placement: 'top',
        target: '[data-testid="join-code"]',
        before: goLobby,
        title: { es: 'Unirte con un código', en: 'Join with a code' },
        text: {
          es: 'Si un amigo te pasó un código de mesa, pégalo aquí y pulsa Unirse para entrar directo a su partida.',
          en: 'If a friend gave you a table code, paste it here and tap Join to enter their game directly.',
        },
      },
      {
        id: 'public', order: 3, placement: 'top',
        target: '[data-testid="public-tables"]',
        before: goLobby,
        title: { es: 'Mesas públicas', en: 'Public tables' },
        text: {
          es: 'Estas son las mesas abiertas ahora. Pulsa Unirse para jugar o Mirar para ver una partida en curso.',
          en: 'These are the tables open right now. Tap Join to play or Watch to spectate a game in progress.',
        },
      },
      {
        id: 'share', order: 4, placement: 'top',
        target: '[data-testid="share-table"]',
        skipIf: () => !ctx.inGame(),     // el botón vive en el tablero, no en el lobby
        title: { es: 'Invitar al rival', en: 'Invite your opponent' },
        text: {
          es: 'Dentro del tablero, con este botón compartes tu mesa: un enlace #table firmado (QR, copiar o redes). Tu rival lo abre y entra directo; el código viaja en el enlace, nunca a un servidor.',
          en: 'On the board, this button shares your table: a signed #table link (QR, copy or social). Your opponent opens it and joins directly; the code travels in the link, never to a server.',
        },
      },
      {
        id: 'profile', order: 5, placement: 'bottom',
        // El botón de perfil vive en el Shadow DOM de <dotrino-topbar>, así que
        // un selector plano (document.querySelector) no lo encuentra: lo
        // resolvemos entrando al shadowRoot.
        target: () => document.querySelector('dotrino-topbar')?.shadowRoot?.querySelector('[data-testid="my-profile"]') || null,
        before: goLobby,
        title: { es: 'Tu identidad', en: 'Your identity' },
        text: {
          es: 'Tu apodo, tu ELO y tu perfil firmado por tu llave viven aquí. Tócalo para verlo y respaldar tu identidad.',
          en: 'Your nickname, your ELO and your key-signed profile live here. Tap it to view it and back up your identity.',
        },
      },
    ],
  })

  // Al terminar, dejamos la app en el lobby (estado neutro).
  instance.addEventListener('cc-tutorial-done', () => ctx.goLobby())
  return instance
}
