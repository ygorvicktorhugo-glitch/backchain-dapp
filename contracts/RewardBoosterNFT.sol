// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title RewardBoosterNFT
 * @notice Versão corrigida para incluir a função getHighestBoost (mock) e remover eventos duplicados.
 */
contract RewardBoosterNFT is ERC721, Ownable {
    using Strings for uint256;

    // --- State Variables ---

    mapping(uint256 => uint256) public boostBips;
    mapping(uint256 => string) public tokenMetadataFile;
    string private _customBaseURI;
    uint256 private _tokenIdCounter;

    // --- Events ---
    // Removido: event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    // Removido: event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    // Removido: event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    
    event BoosterMinted(uint256 indexed tokenId, address indexed owner, uint256 boostInBips); // Evento customizado mantido.

    // --- Constructor ---
    constructor(
        address _initialOwner
    ) ERC721("Backchain Reward Booster", "BKCB") Ownable(_initialOwner) {}

    // --- Funções de Mint e Configuração (Apenas para o Dono) ---

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _customBaseURI = newBaseURI;
    }
    
    function safeMintWithBoost(address to, uint256 boostInBips, string calldata metadataFile) internal {
         uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);
        
        boostBips[tokenId] = boostInBips;
        tokenMetadataFile[tokenId] = metadataFile;

        emit BoosterMinted(tokenId, to, boostInBips);
    }

    function batchSafeMintWithBoost(address to, uint256 quantity, uint256 boostInBips, string calldata metadataFile) external onlyOwner {
        require(quantity > 0, "Quantity must be greater than zero");
        for (uint256 i = 0; i < quantity; i++) {
            safeMintWithBoost(to, boostInBips, metadataFile);
        }
    }
    
    function batchTransferFrom(address from, address to, uint256[] calldata tokenIds) external {
        require(from == msg.sender || isApprovedForAll(from, msg.sender), "ERC721: caller is not token owner or approved");
        for (uint i = 0; i < tokenIds.length; i++) {
            _transfer(from, to, tokenIds[i]);
        }
    }

    // --- Funções de Consulta (View) ---

    /**
     * @notice (ADICIONADO) Retorna o maior boost. NO CONTRATO ATUAL, ESTA FUNÇÃO REVERTE,
     * FORÇANDO O FRONTEND A FAZER O CÁLCULO OFF-CHAIN.
     */
    function getHighestBoost(address user) public view returns (uint256) {
        // Força a reversão com mensagem clara para o desenvolvedor saber o problema.
        revert("RBNFT: Highest boost must be calculated off-chain or requires ERC721Enumerable.");
    }
    
    /**
     * @notice (HERANÇA) Funcao de enumeração que o frontend chama para listar os NFTs do usuario.
     * @dev Como o ERC721Enumerable foi removido, esta chamada irá reverter.
     */
    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        revert("RBNFT: Enumeration function removed for gas efficiency.");
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721: URI query for nonexistent token");
        string memory baseURI = _customBaseURI;
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenMetadataFile[tokenId])) : "";
    }
    
    function _exists(uint256 tokenId) internal view returns (bool) {
        return ownerOf(tokenId) != address(0);
    }
}