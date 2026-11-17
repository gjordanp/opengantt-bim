# Prompt para la IA (demo, parte 1)

Se pegan **juntos** en ChatGPT o Claude: primero las instrucciones (la app las copia con «Importar con IA… → Copiar instrucciones»; el texto vive en `src/shared/aiPlan.ts`, `AI_PROMPT`) y después la descripción del proyecto.

## Descripción del proyecto

```
Un edificio de 2 subterráneos y 7 pisos sobre cota cero (9 niveles en total).
La estructura de desglose (WBS) es por Niveles (tareas resumen: "Subterráneo -2", "Subterráneo -1", "Piso 1" al "Piso 7") y dentro de cada nivel van sus Ciclos como actividades hijas.

* Cantidad de ciclos: 8 ciclos por cada subterráneo y 5 ciclos por cada piso sobre cota cero.
* Nombre de las actividades: deben llamarse únicamente "Ciclo 1", "Ciclo 2", etc., sin incluir el nombre del nivel en el texto de la tarea.
* Duración: cada ciclo dura 16 días hábiles en los subterráneos y 8 días hábiles en los pisos sobre cota cero.
* Secuencia: vincula todos los ciclos de forma continua (Fin a Inicio, FS). Al terminar el último ciclo de un nivel, se conecta directamente con el "Ciclo 1" del nivel siguiente.
```

## Resultado esperado

60 tareas (9 resúmenes y 51 ciclos) y 50 vínculos FS en una sola cadena. El respaldo ya hecho está en `cronograma-ia.json` (se pega en la app si la IA o la red fallan).
