# ABYSS INVADERS

Jeu d'arcade spatial 2D en pixel art (HTML5 + Canvas 2D + JavaScript, Vite).
Exploration libre, minage au laser, base évolutive à défendre contre des raids d'envahisseurs.

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # version statique dans dist/
```

## Commandes

| Action | Clavier + souris | Clavier seul | Tactile |
| --- | --- | --- | --- |
| Voler | WASD / ZQSD / flèches | idem | Joystick : glisser depuis l'endroit touché |
| Viser | La souris (le vaisseau suit le curseur) | Direction du vol | Visée automatique sur l'ennemi le plus proche |
| Tirer | Clic gauche (maintenir) | Espace | Automatique quand un ennemi est à portée |
| Laser minier | Clic droit ou X : verrouillage auto sur l'astéroïde le plus proche | X | Bouton MINE |
| Nova | Shift | Shift | Bouton NOVA |
| Accoster | E près de la base | E | Bouton DOCK |
| Pause | Échap / P | Échap / P | Icône pause |

Pilotage : accélération quasi immédiate, freinage rapide quand on relâche, caméra centrée. Un simple frôlement d'astéroïde fait glisser le vaisseau. Seul un choc à pleine vitesse fait des dégâts.

## Boucle de jeu (exploration)

- **Secteur ouvert de 1600x1600 px** avec la **base** au centre. Une minicarte révèle les zones explorées (en gris) et affiche le pourcentage exploré. Des flèches au bord de l'écran indiquent la base, les ennemis proches et les raids.
- **Plus on s'éloigne de la base**, plus les astéroïdes sont gros et riches (veines de cristaux), mais plus les patrouilles sont nombreuses et résistantes (rapides, puis blindées).
- **Patrouilles** : des groupes d'envahisseurs errent dans le secteur. Ils attaquent quand on s'approche (moins de 130 px) et abandonnent la poursuite au-delà de 320 px.
- **Laser minier** : il extrait tout le minerai d'un astéroïde. Les tirs le cassent mais ne laissent qu'un cristal.
- **Soute limitée** : passer au-dessus de la base la vide automatiquement dans le hangar. La touche E (ou DOCK) ouvre le hangar et répare la coque.
- **Raids sur la base** : le premier arrive vers 2 min 30, puis toutes les 2 min 20 à 3 min 20. Une alerte annonce leur côté (NORTH, EAST, SOUTH ou WEST) 20 s à l'avance. Les raiders foncent sur la base et tirent sur son bouclier, ce qui fait baisser les PV de la base (barre BASE en haut). Il y a un boss tous les 3 raids. Un raid repoussé rapporte des cristaux et des points.
- **Mort du vaisseau** : la soute est perdue et le vaisseau est reconstruit à la base au bout de 3 s. **La partie se termine quand la base est détruite.**
- **Sillage** : en thème Abyss, des bulles et des remous s'échappent derrière le vaisseau, d'autant plus qu'il va vite.

## Base évolutive (onglet BASE du hangar)

| Module | Visible sur la station | Effet | Coûts |
| --- | --- | --- | --- |
| LAB | tour de recherche au-dessus de l'anneau, un étage de plus par niveau | débloque les niveaux d'amélioration du vaisseau : le niveau N demande LAB N-1 | 40 / 90 / 160 / 260 |
| TURRETS | plateformes et canons sur les diagonales, qui visent seuls | +1 tourelle automatique par niveau (portée 120) | 35 / 70 / 120 / 190 |
| SHIELD | pylônes de chaque côté | PV de la base +40, réparation plus rapide | 30 / 60 / 110 / 180 |
| REFINERY | cuves de minerai sous l'anneau | +15 % de cristaux au déchargement | 50 / 100 / 170 / 260 |

Dans le hangar, les pièces du prochain niveau clignotent sur l'aperçu (vaisseau ou station).

## Améliorations visibles

Le vaisseau est assemblé à partir de pièces (`src/game/shipgen.js`) : chaque niveau de chaque amélioration ajoute des pièces visibles en jeu, dans le menu et dans le hangar, où les pièces du prochain niveau clignotent en aperçu.

| Amélioration | Ce qui change sur le vaisseau | Effet |
| --- | --- | --- |
| POWER | canon de nez allongé, canons d'aile (niv. 2), canons latéraux (niv. 4), bouches chargées (niv. 5) | cadence, 1 à 3 puis 5 canons, dégâts x2 |
| SPEED | moteur principal, moteurs latéraux, ailerons, postcombustion, flammes plus longues | vitesse et accélération |
| HARVEST | hublot de soute, antennes collectrices, nacelles, émetteurs | soute +10, aimant, laser plus long et plus rapide, cristaux bonus |
| HULL | blindage latéral, ailes blindées, bouclier de nez, plaques arrière | +1 PV max |
| NOVA | noyau qui grossit et s'illumine | recharge et dégâts |

5 niveaux par amélioration, coûts 20 / 45 / 80 / 130 / 200 cristaux. Au-delà du niveau 1, il faut de la recherche (LAB). Sauvegarde LocalStorage : `space-harvester-save-v2`.

## Secteurs procéduraux

Chaque partie génère ses secteurs (graine aléatoire, `src/game/world.js`). Chaque secteur mélange 4 biomes répartis en régions :

| Biome | Décor | Effet en jeu |
|---|---|---|
| Récif | coraux, anémones, bancs de poissons | calme, entoure la base |
| Kelp | forêts d'algues qui ondulent | cache le sous-marin des patrouilles (HIDDEN) |
| Épaves | cargos coulés, conteneurs, chaînes | caisses à ouvrir (tir ou laser) pour du butin |
| Fosse | fissures, cheminées, vers, méduses | minerai très riche, éruptions qui abîment la coque |

Plus on descend (DEPTH 1, 2, 3...), moins il y a de récif et plus il y a de fosses, avec des ennemis plus résistants et un minerai plus riche. Une porte mène au secteur suivant (il faut un LAB du niveau de la profondeur, LAB 4 au-delà) et une porte BASE ramène au secteur d'origine. Les raids n'avancent que quand on est au secteur de la base. Mourir ramène à la base.

Vaisseau : le **bathyscaphe** (sphère à hublot, flotteur, ballasts) avec ses pièces modulaires dans `src/game/shipgen.js`.

## Direction artistique

Chaque thème utilise exactement 5 couleurs (`src/engine/palette.js`), toujours avec les mêmes rôles : fond, secondaire, vaisseau et interactif, ressources, texte et lumière.

| Thème | Couleurs | Ambiance |
| --- | --- | --- |
| ABYSS (par défaut, mode sous-marin) | `#0A1628` `#1E4A66` `#2F8FBF` `#7CD3C8` `#E3F2F0` | bulles qui montent, plancton, titre ABYSS INVADERS |
| SPACE | `#101820` `#344B50` `#65A89A` `#B8C98B` `#F2E6C9` | étoiles, même titre |

On change de thème dans SETTINGS > THEME, et le choix est sauvegardé. Tous les sprites sont reconstruits avec la nouvelle palette.
Résolution interne 240x320, mise à l'échelle sans interpolation, aucun dégradé ni transparence.

## Architecture

```
src/
  main.js              point d'entrée
  engine/              moteur : boucle à pas fixe, rendu, entrées, palette, polices, sprites
  game/
    game.js            pile de scènes, systèmes partagés
    play.js            scène de jeu : flux des vagues, événements, overlays
    player.js          vaisseau (vol libre, tir, laser)
    shipgen.js         vaisseau modulaire : pièces par amélioration, rotation RotSprite
    station.js         base spatiale et bouclier
    zones.js           secteurs de l'espace
    enemies.js         envahisseurs chasseurs, boss, vagues
    asteroids.js       astéroïdes
    resources.js       cristaux, kits de réparation
    bullets.js         projectiles
    collisions.js      collisions
    effects.js         particules, anneaux, textes flottants
    stars.js           fond étoilé parallaxe
    progression.js     améliorations, stats, sauvegarde LocalStorage
  ui/                  HUD, boutons, écrans (menu, upgrades, settings, game over)
  audio/audio.js       synthé Web Audio : sons 8-bit et musique en boucle
```

## Documents de conception

`docs/concepts/` contient les planches de conception (pages HTML autonomes, à ouvrir dans un navigateur) : sous-marins et mondes, base iris, base biomécanique, artisanat.

## Développement

- Règles de travail : voir `CLAUDE.md`.
- Aucune CI GitHub Actions n'est utilisée : les vérifications se font en local (`npm run build` au minimum) et chaque pull request indique les tests réellement exécutés.
- Prérequis : Node.js 20.19+ ou 22.12+ (exigence de Vite 8).
