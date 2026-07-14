# Duendes en la Selva

Juego de supervivencia y exploración en pixel art basado en el GDD incluido en este repositorio.

## Jugar

```bash
npm start
```

Abre `http://127.0.0.1:4173` en un navegador moderno. No hay dependencias que instalar ni servicios externos: los mapas, sprites y efectos de sonido se generan en el navegador.

## Controles

- `WASD` o flechas: caminar
- `E` o espacio: recoger, usar una salida, entrar a un calabozo, descansar o talar un árbol adyacente
- `C`: abrir el menú de fabricación
- `B`: abrir el menú de construcción

En pantallas táctiles aparecen una cruceta y un botón de acción. La partida se guarda automáticamente en el navegador.

## Sistemas implementados

- mapas aleatorios conectados de 12×12 casillas;
- bosque denso no transitable, tierra, jardín y caminos empedrados;
- ramas, piedras y lianas accesibles en cada mapa;
- las seis recetas del GDD y sus herramientas requeridas;
- tala de bordes con hacha para obtener troncos sin abrir el bosque;
- base, silla, trampa y corral con los costes de troncos especificados;
- salida normal y calabozo infrecuente;
- enemigos, mercaderes y tesoros con factor de aparición creciente;
- salud, días, avance entre mapas, controles táctiles y guardado local.

## Verificar

```bash
npm test
npm run check
```
