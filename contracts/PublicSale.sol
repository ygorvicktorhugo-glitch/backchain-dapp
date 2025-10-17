// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract PublicSale is Ownable, IERC721Receiver {
    IERC721 public immutable nftContract;
    address public treasuryWallet;

    struct Tier {
        uint256 priceInWei;
        uint256[] tokenIds;
        uint256 nextTokenIndex;
    }

    mapping(uint256 => Tier) public tiers;

    event NFTSold(address indexed buyer, uint256 indexed tierId, uint256 indexed tokenId, uint256 price);
    event NFTRescued(address indexed owner, uint256 indexed tierId, uint256 indexed tokenId);

    constructor(address _nftContractAddress, address _initialOwner, address _treasury) Ownable(_initialOwner) {
        nftContract = IERC721(_nftContractAddress);
        treasuryWallet = _treasury;
    }

    /**
     * @notice (Dono) Configura um tier de venda: define o preço e deposita os NFTs.
     * @param _tierId O ID do tier (0 para Diamond, 1 para Platinum, etc.).
     * @param _priceInWei O preço do NFT em Wei.
     * @param _tokenIds A lista de IDs dos NFTs que serao vendidos neste tier.
     */
    function setTier(uint256 _tierId, uint256 _priceInWei, uint256[] calldata _tokenIds) external onlyOwner {
        Tier storage tier = tiers[_tierId];
        tier.priceInWei = _priceInWei;
        tier.tokenIds = _tokenIds;
        tier.nextTokenIndex = 0;

        for (uint i = 0; i < _tokenIds.length; i++) {
            require(nftContract.ownerOf(_tokenIds[i]) == msg.sender, "Dono deve possuir todos os NFTs para lista-los");
            nftContract.safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
        }
    }

    /**
     * @notice (Usuario) Compra um unico NFT de um tier.
     * @param _tierId O ID do tier que o usuario deseja comprar.
     */
    function buyNFT(uint256 _tierId) external payable {
        buyMultipleNFTs(_tierId, 1);
    }

    /**
     * @notice (Usuario) Compra uma quantidade especifica de NFTs de um tier.
     * @param _tierId O ID do tier que o usuario deseja comprar.
     * @param _quantity A quantidade de NFTs a serem comprados.
     */
    function buyMultipleNFTs(uint256 _tierId, uint256 _quantity) public payable {
        require(_quantity > 0, "Venda: A quantidade deve ser maior que zero");
        Tier storage tier = tiers[_tierId];
        require(tier.priceInWei > 0, "Venda: Tier nao configurado");
        
        uint256 totalPrice = tier.priceInWei * _quantity;
        require(msg.value == totalPrice, "Venda: Valor em ETH incorreto para a quantidade solicitada");
        
        require(tier.nextTokenIndex + _quantity <= tier.tokenIds.length, "Venda: Quantidade solicitada excede o estoque!");

        for (uint i = 0; i < _quantity; i++) {
            uint256 tokenIdToSell = tier.tokenIds[tier.nextTokenIndex];
            tier.nextTokenIndex++;
            emit NFTSold(msg.sender, _tierId, tokenIdToSell, tier.priceInWei);
            nftContract.safeTransferFrom(address(this), msg.sender, tokenIdToSell);
        }
    }

    /**
     * @notice (Dono) Resgata os fundos em ETH acumulados no contrato.
     */
    function withdrawFunds() external onlyOwner {
        (bool success, ) = treasuryWallet.call{value: address(this).balance}("");
        require(success, "Saque falhou");
    }

    /**
     * @notice (Dono) Resgata todos os NFTs que ainda nao foram vendidos de um tier especifico.
     * @param _tierId O ID do tier do qual voce quer resgatar os NFTs.
     */
    function withdrawUnsoldNFTs(uint256 _tierId) external onlyOwner {
        Tier storage tier = tiers[_tierId];
        uint256 remaining = tier.tokenIds.length - tier.nextTokenIndex;
        require(remaining > 0, "Nenhum NFT nao vendido neste tier");

        for (uint i = tier.nextTokenIndex; i < tier.tokenIds.length; i++) {
            nftContract.safeTransferFrom(address(this), owner(), tier.tokenIds[i]);
        }
        
        tier.nextTokenIndex = tier.tokenIds.length;
    }

    /**
     * @notice (Dono) Resgata um NFT especifico que esta listado para venda.
     * @param _tierId O ID do tier onde o NFT esta listado.
     * @param _tokenId O ID do token especifico a ser resgatado.
     */
    function rescueNFT(uint256 _tierId, uint256 _tokenId) external onlyOwner {
        Tier storage tier = tiers[_tierId];
        uint256 totalTokens = tier.tokenIds.length;
        require(totalTokens > 0, "Tier nao tem tokens");

        uint256 tokenIndex = type(uint256).max;
        for (uint i = 0; i < totalTokens; i++) {
            if (tier.tokenIds[i] == _tokenId) {
                tokenIndex = i;
                break;
            }
        }
        require(tokenIndex != type(uint256).max, "Token nao encontrado no tier");

        uint256 lastTokenId = tier.tokenIds[totalTokens - 1];
        tier.tokenIds[tokenIndex] = lastTokenId;
        tier.tokenIds.pop();

        if (tokenIndex < tier.nextTokenIndex) {
            tier.nextTokenIndex--;
        }

        emit NFTRescued(owner(), _tierId, _tokenId);
        nftContract.safeTransferFrom(address(this), owner(), _tokenId);
    }

    function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}