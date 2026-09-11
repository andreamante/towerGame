interface YGOCard {
    id: number;
    name: string;
    atk: number;
    def: number;
    image_url: string;
}

interface Enemy {
    card: YGOCard;
    stunTurns: number;
}

let playerName: string = "Player";
let hp: number = 10000;
let pe: number = 0;
let score: number = 0;
let turn: number = 1;
let enemiesDestroyed: number = 0;
let numRows: number = 3;
let enemiesPerTurn: number = 1;
const cols: number = 7;

let deck: YGOCard[] = [];
let hand: YGOCard[] = [];
let grid: (Enemy | null)[][] = [];
let defenders: (YGOCard | null)[] = [];
let selectedCardIndex: number | null = null;

const domGrid = document.getElementById('grid-area')!;
const domHand = document.getElementById('hand-area')!;
const domHP = document.getElementById('base-hp')!;
const domPE = document.getElementById('pe')!;
const domScore = document.getElementById('score')!;
const domTurn = document.getElementById('turn')!;
const domIncoming = document.querySelector('#incoming-dmg span') as HTMLElement;

async function initGame() {
    const params = new URLSearchParams(window.location.search);
    playerName = params.get('player') || 'Anonimo';
    document.querySelector('#player-name span')!.textContent = playerName;

    await fetchCardPool();
    initGrid();
    for (let i = 0; i < 7; i++) drawCard();
    renderHand();
    renderGrid();
    updateUI();
    setupListeners();
}

async function fetchCardPool() {
    try {
        const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?type=normal%20monster');
        const data = await res.json();
        deck = data.data
            .filter((c: any) => typeof c.atk === 'number' && typeof c.def === 'number')
            .map((c: any) => ({
                id: c.id,
                name: c.name,
                atk: c.atk,
                def: c.def,
                image_url: c.card_images[0].image_url_small
            }));
    } catch (e) {
        alert("Errore API YGO. Ricarica la pagina.");
    }
}

function getRandomCard(): YGOCard {
    if (deck.length === 0) return { id: 0, name: "???", atk: 0, def: 0, image_url: "" };
    const idx = Math.floor(Math.random() * deck.length);
    return deck[idx];
}

function initGrid() {
    grid = [];
    defenders = [];
    for (let r = 0; r < numRows; r++) {
        grid.push(new Array(cols).fill(null));
        defenders.push(null);
    }
}

function drawCard() {
    if (hand.length < 10) hand.push(getRandomCard());
}

function playCardOnRow(rowIndex: number) {
    if (selectedCardIndex === null) {
        alert("Seleziona prima una carta dalla mano!");
        return;
    }
    if (defenders[rowIndex]) {
        alert("C'è già un difensore su questa riga!");
        return;
    }
    const defenderCard = hand[selectedCardIndex];
    hand.splice(selectedCardIndex, 1);
    selectedCardIndex = null;
    defenders[rowIndex] = defenderCard;

    resolveDefense(rowIndex);
    renderHand();
    renderGrid();
    updateUI();
}

function resolveDefense(rowIndex: number) {
    const defenderCard = defenders[rowIndex];
    if (!defenderCard) return;

    const enemiesOnRow: { col: number, enemy: Enemy }[] = [];
    for (let c = 0; c < cols; c++) {
        const cell = grid[rowIndex][c];
        if (cell) enemiesOnRow.push({ col: c, enemy: cell });
    }
    if (enemiesOnRow.length === 0) return;

    const totalDef = enemiesOnRow.reduce((sum, e) => sum + e.enemy.card.def, 0);

    if (enemiesOnRow.length > 1 && defenderCard.atk > totalDef) {
        enemiesOnRow.forEach(e => {
            grid[rowIndex][e.col] = null;
            onEnemyDestroyed(defenderCard.atk, e.enemy.card.def);
        });
        defenders[rowIndex] = null;
        return;
    }

    const target = enemiesOnRow[0];
    if (defenderCard.atk > target.enemy.card.def) {
        grid[rowIndex][target.col] = null;
        onEnemyDestroyed(defenderCard.atk, target.enemy.card.def);
    } else {
        defenders[rowIndex] = null;
        enemiesOnRow.forEach(e => e.enemy.stunTurns = 2);
    }
}

function onEnemyDestroyed(PA: number, PD: number) {
    pe += 1;
    enemiesDestroyed += 1;
    let pts = PA > 0 ? Math.floor((1 - (PA - PD) / PA) * PA * turn) : PD * turn;
    if (pts < 0) pts = 1;
    score += pts;
    if (enemiesDestroyed % 10 === 0) enemiesPerTurn++;
}

function processTurn() {
    for (let r = 0; r < numRows; r++) {
        if (defenders[r]) resolveDefense(r);
    }

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell) continue;
            if (cell.stunTurns > 0) {
                cell.stunTurns--;
                continue;
            }
            if (c === 0) {
                hp -= cell.card.atk;
                grid[r][c] = null;
                if (hp <= 0) { gameOver(); return; }
            } else if (!grid[r][c - 1]) {
                grid[r][c - 1] = cell;
                grid[r][c] = null;
            }
        }
    }

    for (let i = 0; i < enemiesPerTurn; i++) {
        const freeRows: number[] = [];
        for (let r = 0; r < numRows; r++) {
            if (!grid[r][cols - 1]) freeRows.push(r);
        }
        if (freeRows.length > 0) {
            const randomRow = freeRows[Math.floor(Math.random() * freeRows.length)];
            grid[randomRow][cols - 1] = { card: getRandomCard(), stunTurns: 0 };
        }
    }

    turn++;
    if (turn % 3 === 0) drawCard();
    if (turn % 10 === 0) {
        numRows++;
        grid.push(new Array(cols).fill(null));
        defenders.push(null);
    }

    renderGrid();
    renderHand();
    updateUI();
}

function gameOver() {
    alert(`GAME OVER! Hai totalizzato ${score} punti.`);
    let lb = JSON.parse(localStorage.getItem('ygo_leaderboard') || '[]');
    lb.push({ name: playerName, score: score });
    lb.sort((a: any, b: any) => parseInt(b.score) - parseInt(a.score));
    lb = lb.slice(0, 10);
    localStorage.setItem('ygo_leaderboard', JSON.stringify(lb));
    window.location.href = `leaderboard.html?score=${score}`;
}

function renderGrid() {
    domGrid.innerHTML = '';
    for (let r = 0; r < numRows; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        rowDiv.onclick = () => playCardOnRow(r);

        const slotDiv = document.createElement('div');
        const def = defenders[r];
        slotDiv.className = 'defender-slot' + (def ? '' : ' empty');
        if (def) {
            const img = document.createElement('img');
            img.src = def.image_url;
            img.className = 'card-mini';
            img.title = `Difensore ATK: ${def.atk}`;
            slotDiv.appendChild(img);
        }
        rowDiv.appendChild(slotDiv);

        for (let c = 0; c < cols; c++) {
            const cellDiv = document.createElement('div');
            cellDiv.className = 'cell';
            const enemy = grid[r][c];
            if (enemy) {
                const img = document.createElement('img');
                img.src = enemy.card.image_url;
                img.className = `card-mini ${enemy.stunTurns > 0 ? 'stunned' : ''}`;
                img.title = `ATK: ${enemy.card.atk} DEF: ${enemy.card.def}`;
                cellDiv.appendChild(img);
            }
            rowDiv.appendChild(cellDiv);
        }
        domGrid.appendChild(rowDiv);
    }
}

function renderHand() {
    const bottoni = document.querySelector('.controls')!;
    domHand.innerHTML = '';
    hand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = card.image_url;
        img.className = 'card-in-hand ' + (selectedCardIndex === index ? 'card-selected' : '');
        img.title = `ATK: ${card.atk} DEF: ${card.def}`;
        img.onclick = (e) => {
            e.stopPropagation();
            selectedCardIndex = selectedCardIndex === index ? null : index;
            renderHand();
        };
        domHand.appendChild(img);
    });
    domHand.appendChild(bottoni);
}

function updateUI() {
    domHP.innerText = hp.toString();
    domPE.innerText = pe.toString();
    domScore.innerText = score.toString();
    domTurn.innerText = turn.toString();

    let incomingDmg = 0;
    for (let r = 0; r < numRows; r++) {
        if (defenders[r]) continue;
        const cell = grid[r][0];
        if (cell && cell.stunTurns === 0) incomingDmg += cell.card.atk;
    }
    domIncoming.innerText = incomingDmg.toString();
}

function setupListeners() {
    document.getElementById('btn-end-turn')!.onclick = () => processTurn();

    document.getElementById('btn-buy-card')!.onclick = () => {
        if (pe >= 5 && hand.length < 10) {
            pe -= 5;
            drawCard();
            renderHand();
            updateUI();
        } else {
            alert("Non hai abbastanza PE o hai la mano piena (Max 10)!");
        }
    };

    document.getElementById('btn-swap-card')!.onclick = () => {
        if (selectedCardIndex === null) {
            alert("Seleziona una carta prima!");
            return;
        }
        if (pe >= 1) {
            pe -= 1;
            hand[selectedCardIndex] = getRandomCard();
            selectedCardIndex = null;
            renderHand();
            updateUI();
        } else {
            alert("Non hai abbastanza PE!");
        }
    };
}

initGame();