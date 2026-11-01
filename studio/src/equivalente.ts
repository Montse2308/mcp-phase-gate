// Empareja un nombre de proyecto o de tarea con el de la otra lista.
// Un nombre que ya está en la otra se queda. Si no está, y las dos miden lo mismo, se usa la misma
// posición. Misma longitud y distinto orden no avisa: devuelve el de esa posición, no null. null (la
// ruta vuelve a la Red) solo sale si el nombre no está en la primera lista o las dos no miden lo mismo.
export function equivalente(nombre: string, aqui: string[], alli: string[]): string | null {
  if (alli.includes(nombre)) return nombre;
  const i = aqui.indexOf(nombre);
  return i !== -1 && aqui.length === alli.length ? alli[i]! : null;
}
