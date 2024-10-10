const axios = require('axios');
const ethers = require('ethers');
const fs = require('fs');
const csv = require('csv-parser');
require('dotenv').config();
const CryptoJS = require('crypto-js');
const nodemailer = require('nodemailer');  // Importar Nodemailer

// Define your provider and contract information
const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com/');  // Replace with actual RPC URL
const privateKey = '22f2b607a7f996c8b128cba8b19cfab6b999c77be5e749c3f881e5cc36d0799f';  // Replace with your wallet's private key
const wallet = new ethers.Wallet(privateKey, provider);
const contractAddress = '0x820147De42316BDAe07625f1E2771f458eA58876';  // Contract address

// Define the contract ABIs
const createUserContractABI = [
    "function createNewUser(address _address, string memory _encryptedEmail, string memory _encryptedName, string memory _encryptedUsername, string memory _encryptedPhoneNumber)"
];

const nftAdminContractABI = [
    "function createNFTAdmin(string memory _nameAccount, address _user, uint256 _sponsor, string memory NFTCid, uint256 legSide, uint256 _nftNumber) public",
    "function tokenIdsValidus() public view returns (uint256)" // Add the getter for tokenIdsValidus
];

// Create contract instances
const createUserContract = new ethers.Contract(contractAddress, createUserContractABI, wallet);
const nftAdminContractAddress = '0xb7bE1C12cE04C2e0E5d79Ac437f47462de9a0F68';  // Contract address for createNFTAdmin
const nftAdminContract = new ethers.Contract(nftAdminContractAddress, nftAdminContractABI, wallet);

// Configurar Nodemailer para enviar correos electrónicos
const transporter = nodemailer.createTransport({
    service: 'gmail',  // Puedes cambiar a otro servicio de correo si lo prefieres
    auth: {
        user: process.env.EMAIL_USER,  // Coloca tu email en .env
        pass: process.env.EMAIL_PASS   // Coloca tu contraseña en .env
    }
});

// Function to send email
async function sendEmail(email, name, walletAddress, nftNumber) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Cuenta y NFT creados',
        text: `Hola ${name},\n\nTu cuenta ha sido creada exitosamente.\nWallet: ${walletAddress}\nNFT ID: ${nftNumber}\n\nGracias por registrarte.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Correo enviado a: ${email}`);
    } catch (error) {
        console.error(`Error al enviar el correo a ${email}:`, error);
    }
}

// Function to make the API POST request to get the wallet address
async function getWalletAddress(email) {
    const response = await axios.post('https://embedded-wallet.thirdweb.com/api/v1/pregenerate', {
        strategy: 'email',
        email: email
    }, {
        headers: {
            'x-ecosystem-id': 'ecosystem.defily',
            'x-ecosystem-partner-id': '7558f6ad-cdc1-4982-ae01-ecaa8f99b2c6',
            'x-secret-key': 'CwBQMMwUVHelhLmOV2g0v5ATRTL9XRogEgmxVLPbZxOVNJc6E4ddrRJJ-IkjLbVa0FD9lgGAyOeP6c1KfsN9qA',
            'Content-Type': 'application/json'
        }
    });
    return response.data.wallet.address;
}

const secretKey = process.env.SECRET_KEY;

const encryptHex = (text) => {
    const encryptedMessage = CryptoJS.AES.encrypt(
        text,
        CryptoJS.enc.Hex.parse(secretKey),
        {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7,
        }
    );
    const encryptedHex = encryptedMessage.ciphertext.toString(CryptoJS.enc.Hex);
    return encryptedHex;
};

// Function to get the value of tokenIdsValidus from the contract
async function getTokenIdsValidus() {
    try {
        const tokenIdsValidus = await nftAdminContract.tokenIdsValidus();
        const incrementValue = 1001n;
        const tokenIds = tokenIdsValidus + incrementValue;
        console.log(`tokenIdsValidus: ${tokenIds}`);
        return tokenIds.toString(); // Convert to string for compatibility
    } catch (error) {
        console.error('Error fetching tokenIdsValidus:', error);
        throw error;
    }
}

// Function to execute the contract transaction
async function executeContract(walletAddress, email, name, username, phoneNumber, sponsor, legSide) {
    try {
        const encryptedEmail = encryptHex(email);
        const encryptedFullName = encryptHex(name);
        const encryptedUsername = encryptHex(username);
        const encryptedPhoneNumber = encryptHex(phoneNumber);

        const gasPrice = ethers.parseUnits('150', 'gwei');

        // Call createNewUser on the first contract
        const tx = await createUserContract.createNewUser(
            walletAddress,
            encryptedEmail,
            encryptedFullName,
            encryptedUsername,
            encryptedPhoneNumber,
            { gasPrice: gasPrice }
        );
        await tx.wait();
        console.log('Transaction successful for createNewUser:', tx.hash);

        // Get the current tokenIdsValidus from the contract
        const nftNumber = await getTokenIdsValidus();

        // Call createNFTAdmin on the second contract using sponsor and legSide from the CSV
        const tx2 = await nftAdminContract.createNFTAdmin(
            username,                // _nameAccount
            walletAddress,        // _user
            sponsor,              // _sponsor (from CSV)
            "",     // NFTCid (dummy value)
            legSide,              // legSide (from CSV)
            nftNumber             // _nftNumber (fetched from contract)
        );
        await tx2.wait();
        console.log('Transaction successful for createNFTAdmin:', tx2.hash);

        // Enviar el email con la información
        await sendEmail(email, name, walletAddress, nftNumber);
    } catch (error) {
        console.error('Error executing contract functions:', error);
    }
}


// Function to process each row sequentially
async function processRowSequentially(rows) {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        console.log(`Processing row: ${i + 1}`);

        await processRow(row, i + 1);

        console.log(`Finished processing row: ${i + 1}`);
        console.log("Wallet with POI created successfully, waiting 5 seconds...");
        await delay(5000); // Espera de 5 segundos
    }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Function to process a single row
async function processRow(row, iterationID) {
    const email = row.Email;
    const name = row.Name;
    const username = row.Username;
    const phoneNumber = row.PhoneNumber;
    const sponsor = row.Sponsor;
    const legSide = row.LegSide;
    console.log(row)
    console.log(email)
    // Get wallet address from thirdweb API
    const walletAddress = await getWalletAddress(email);

    console.log(`Iteración ID: ${iterationID}`);
    console.log(`Wallet: ${iterationID} - ${walletAddress}`);

    // Ejecuta el contrato con los valores de sponsor y legSide
    await executeContract(walletAddress, email, name, username, phoneNumber, sponsor, legSide);
}

// Read data from CSV file and process rows sequentially
const rows = [];
fs.createReadStream('./UsersData.csv')
  .pipe(csv())
  .on('data', (row) => {
    rows.push(row);  // Guardar cada fila en un array
  })
  .on('end', async () => {
    console.log('CSV file successfully processed.');
    await processRowSequentially(rows);  // Procesar las filas de manera secuencial
  });
