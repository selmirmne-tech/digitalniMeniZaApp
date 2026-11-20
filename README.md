# digitalMeni

Odvojena React/Vite aplikacija koja gostu prikazuje aktuelni Android meni.

## Pokretanje

```powershell
cd /d E:\digitalMeni
npm install
npm run dev
```

Otvorite URL koji Vite ispiše, uz ID lokala, npr. `http://localhost:5173/restoran`.

## Firebase putanja

`/restoran` se mapira na `Restoran/Menu/Podaci` u Realtime Database projektu `cool-kit-330117` koji koristi Android aplikacija. URL ID se pretvara u čvor sa velikim početnim slovom (`/restoran1` → `Restoran1`). Promjena Firebase URL-a je u `src/firebase.js`.

Gosti čitaju samo `Menu/Podaci`; administratorske funkcije nisu dio ovog projekta. U Firebase konzoli projekta `cool-kit-330117` dodati unutar postojećeg `rules` objekta:

```json
"$restaurantId": {
  "Menu": {
    "Podaci": {
      ".read": true
    }
  }
}
```

## Build i lokalni preview

```powershell
npm install
npm run build
npm run preview
```

Vite koristi native config loader zbog Windows putanje na E: disku.

Za javni hosting, direktne URL putanje poput `/restoran` treba preusmjeriti na `index.html`.
