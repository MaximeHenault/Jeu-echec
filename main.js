const config = {
    type: Phaser.AUTO,
    width: 512,
    height: 512,
    scene: {
        preload: preload,
        create: create
    }
};

let game = new Phaser.Game(config);

function preload() {
    this.load.image('board', 'assets/board.jpg');
    this.load.image('white_pawn', 'assets/pieces/white_pawn.png');
}

function create() {
    this.add.image(256, 256, 'board');

    // Exemple : un pion blanc
    const pawn = this.add.sprite(256, 384, 'white_pawn');
    pawn.setInteractive();
    
    this.input.setDraggable(pawn);
    
    this.input.on('drag', (pointer, gameObject, x, y) => {
        gameObject.x = x;
        gameObject.y = y;
    });
}
