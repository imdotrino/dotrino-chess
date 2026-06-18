# Actualización del Formato de Canal para Chess App

## Cambios Realizados

### 1. WebSocketProxyClient Actualizado

El cliente WebSocket ha sido actualizado para soportar el nuevo formato de canal:

```javascript
// Antes (formato antiguo):
await wsProxyClient.publish('chess_hosts');

// Ahora (formato nuevo - compatible hacia atrás):
await wsProxyClient.publish('chess_hosts', { gameType: 'chess', version: '1.0' });

// También se puede pasar un objeto de canal completo:
const channelObj = {
  data: {
    name: 'chess_hosts',
    publickey: 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKj34GkxFhD90vcNvL4x7FDm6q4f4aBc',
    gameType: 'chess',
    version: '1.0',
    hostToken: 'ABCD'
  },
  signature: 'MEUCIQCy4Vh5ZKpZVwLcQhXwLcQhXwLcQhXwLcQhXwLcQhXwIgYg=='
};
await wsProxyClient.publish(channelObj);
```

### 2. Métodos Actualizados

- `publish(channel, extraData)`: Ahora acepta un string (backward compatibility) o un objeto de canal
- `unpublish(channel)`: Similar a publish
- `listChannel(channel)`: Similar a publish

### 3. Generación Automática de Datos

El cliente genera automáticamente:
- Clave pública mock (para demostración)
- Firma mock en formato base64 válido
- Estructura de datos requerida

### 4. Connection Store Actualizado

El store de conexión ahora incluye datos adicionales al publicar:

```javascript
const extraData = {
  gameType: 'chess',
  version: '1.0',
  timestamp: new Date().toISOString(),
  hostToken: token.value
};
await wsProxyClient.publish('chess_hosts', extraData);
```

## Validaciones del Servidor

El servidor ahora valida:
1. Estructura: `{data: {...}, signature: "..."}`
2. Campos requeridos: `data.name` y `data.publickey`
3. Límite de caracteres: ≤ 1000 caracteres en total
4. Formato de firma: base64 válido, longitud mínima

## Compatibilidad

El sistema mantiene compatibilidad hacia atrás:
- Las llamadas existentes con strings siguen funcionando
- Se generan automáticamente los datos requeridos
- La firma mock pasa las validaciones básicas del servidor

## Notas para Producción

En un entorno de producción:
1. Reemplazar `generateMockPublicKey()` con generación real de claves
2. Reemplazar `generateMockSignature()` con firma criptográfica real
3. Implementar verificación de firma en el cliente si es necesario
4. Considerar almacenamiento seguro de claves privadas