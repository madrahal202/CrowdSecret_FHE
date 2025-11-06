pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CrowdSecret_FHE is ZamaEthereumConfig {
    
    struct Campaign {
        string title;
        euint32 encryptedTotal;
        uint256 publicGoal;
        string description;
        address creator;
        uint256 deadline;
        uint32 decryptedTotal;
        bool isVerified;
    }

    mapping(string => Campaign) public campaigns;
    string[] public campaignIds;

    event CampaignCreated(string indexed campaignId, address indexed creator);
    event DonationAdded(string indexed campaignId, euint32 encryptedAmount);
    event TotalDecrypted(string indexed campaignId, uint32 decryptedTotal);

    constructor() ZamaEthereumConfig() {
    }

    function createCampaign(
        string calldata campaignId,
        string calldata title,
        externalEuint32 encryptedInitial,
        bytes calldata initialProof,
        uint256 publicGoal,
        string calldata description,
        uint256 deadline
    ) external {
        require(bytes(campaigns[campaignId].title).length == 0, "Campaign already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedInitial, initialProof)), "Invalid encrypted input");

        campaigns[campaignId] = Campaign({
            title: title,
            encryptedTotal: FHE.fromExternal(encryptedInitial, initialProof),
            publicGoal: publicGoal,
            description: description,
            creator: msg.sender,
            deadline: deadline,
            decryptedTotal: 0,
            isVerified: false
        });

        FHE.allowThis(campaigns[campaignId].encryptedTotal);
        FHE.makePubliclyDecryptable(campaigns[campaignId].encryptedTotal);
        campaignIds.push(campaignId);

        emit CampaignCreated(campaignId, msg.sender);
    }

    function addDonation(
        string calldata campaignId,
        externalEuint32 encryptedAmount,
        bytes calldata amountProof
    ) external {
        require(bytes(campaigns[campaignId].title).length > 0, "Campaign does not exist");
        require(block.timestamp < campaigns[campaignId].deadline, "Campaign has ended");
        require(FHE.isInitialized(FHE.fromExternal(encryptedAmount, amountProof)), "Invalid encrypted amount");

        euint32 memory encryptedDonation = FHE.fromExternal(encryptedAmount, amountProof);
        FHE.allowThis(encryptedDonation);
        FHE.makePubliclyDecryptable(encryptedDonation);

        campaigns[campaignId].encryptedTotal = FHE.add(campaigns[campaignId].encryptedTotal, encryptedDonation);
        emit DonationAdded(campaignId, encryptedDonation);
    }

    function verifyTotal(
        string calldata campaignId,
        bytes memory abiEncodedClearTotal,
        bytes memory decryptionProof
    ) external {
        require(bytes(campaigns[campaignId].title).length > 0, "Campaign does not exist");
        require(!campaigns[campaignId].isVerified, "Total already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(campaigns[campaignId].encryptedTotal);

        FHE.checkSignatures(cts, abiEncodedClearTotal, decryptionProof);

        uint32 decodedTotal = abi.decode(abiEncodedClearTotal, (uint32));
        campaigns[campaignId].decryptedTotal = decodedTotal;
        campaigns[campaignId].isVerified = true;

        emit TotalDecrypted(campaignId, decodedTotal);
    }

    function getEncryptedTotal(string calldata campaignId) external view returns (euint32) {
        require(bytes(campaigns[campaignId].title).length > 0, "Campaign does not exist");
        return campaigns[campaignId].encryptedTotal;
    }

    function getCampaignDetails(string calldata campaignId) external view returns (
        string memory title,
        uint256 publicGoal,
        string memory description,
        address creator,
        uint256 deadline,
        bool isVerified,
        uint32 decryptedTotal
    ) {
        require(bytes(campaigns[campaignId].title).length > 0, "Campaign does not exist");
        Campaign storage campaign = campaigns[campaignId];

        return (
            campaign.title,
            campaign.publicGoal,
            campaign.description,
            campaign.creator,
            campaign.deadline,
            campaign.isVerified,
            campaign.decryptedTotal
        );
    }

    function getAllCampaignIds() external view returns (string[] memory) {
        return campaignIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

