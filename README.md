<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HOSPEDAH</title>
<style>
body {
    font-family: Arial, sans-serif;
    background: #fff;
    color: #111;
    margin: 0;
    padding: 40px;
}
.container {
    max-width: 800px;
    margin: auto;
}
h1 {
    font-size: 40px;
    margin-bottom: 5px;
}
h2 {
    margin-top: 40px;
}
input {
    width: 100%;
    padding: 12px;
    margin: 10px 0;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
}
button {
    padding: 12px 20px;
    background: black;
    color: white;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.3s;
}
button:hover {
    background: #444;
}
.card {
    margin-top: 30px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.error {
    color: red;
    font-size: 14px;
    margin-top: 5px;
}
</style>
</head>
<body>
<div class="container">
<h1>HOSPEDAH</h1>
<p>Sua experiência começa aqui.</p>
<h2>Monte sua proposta</h2>
<input id="nome" placeholder="Nome do cliente" required>
<div id="nomeError" class="error"></div>
<input id="destino" placeholder="Destino" required>
<div id="destinoError" class="error"></div>
<input id="data" placeholder="Data da viagem" type="date" required>
<div id="dataError" class="error"></div>
<input id="pessoas" placeholder="Quantidade de pessoas" type="number" min="1" required>
<div id="pessoasError" class="error"></div>
<button onclick="gerar()">Gerar proposta</button>
<div id="resultado"></div>
</div>
<script>
function gerar() {
    // Clear previous errors
    document.getElementById("nomeError").innerText = "";
    document.getElementById("destinoError").innerText = "";
    document.getElementById("dataError").innerText = "";
    document.getElementById("pessoasError").innerText = "";
    let nome = document.getElementById("nome").value.trim();
    let destino = document.getElementById("destino").value.trim();
    let data = document.getElementById("data").value;
    let pessoas = document.getElementById("pessoas").value;
    let hasErrors = false;
    if (!nome) {
        document.getElementById("nomeError").innerText = "Nome do cliente é obrigatório.";
        hasErrors = true;
    }
    if (!destino) {
        document.getElementById("destinoError").innerText = "Destino é obrigatório.";
        hasErrors = true;
    }
    if (!data) {
        document.getElementById("dataError").innerText = "Data da viagem é obrigatória.";
        hasErrors = true;
    }
    if (!pessoas || pessoas < 1) {
        document.getElementById("pessoasError").innerText = "Quantidade de pessoas deve ser pelo menos 1.";
        hasErrors = true;
    }
    if (hasErrors) return;
    // Format date
    let formattedData = new Date(data).toLocaleDateString('pt-BR');
    document.getElementById("resultado").innerHTML = `
    <div class="card">
        <h2>Proposta para ${nome}</h2>
        <p><strong>Destino:</strong> ${destino}</p>
        <p><strong>Data:</strong> ${formattedData}</p>
        <p><strong>Pessoas:</strong> ${pessoas}</p>
        <h3>Inclui:</h3>
        <ul>
            <li>Planejamento completo</li>
            <li>Hospedagem selecionada</li>
            <li>Suporte durante a viagem</li>
        </ul>
        <h3>Experiência HOSPEDAH</h3>
        <p>Conforto, organização e tranquilidade em cada etapa da sua viagem.</p>
        <a href="https://wa.me/5517982006382" target="_blank">
            <button>Falar com especialista</button>
        </a>
    </div>
    `;
}
</script>
</body>
</html>
