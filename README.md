# CrowdSecret_FHE

CrowdSecret_FHE is a privacy-preserving crowdfunding platform empowered by Zama's Fully Homomorphic Encryption (FHE) technology. This innovative application enables secure fundraising while maintaining the confidentiality of individual contributions—ensuring both transparency and privacy in the decentralized finance (DeFi) space.

## The Problem

In traditional crowdfunding platforms, contributors' information and donation amounts are often visible to all participants. This lack of privacy can deter potential investors who are concerned about their anonymity and the risk of being targeted for large investments. Furthermore, public visibility exposes contributors to market manipulation and tracking by larger investors, undermining the fundamental principles of trust and transparency within crowdfunding.

## The Zama FHE Solution

Fully Homomorphic Encryption (FHE) revolutionizes the way we can manage data privacy in crowdfunding. By allowing computation on encrypted data, FHE ensures that sensitive information regarding contributions is kept confidential. Utilizing Zama's advanced tools, the CrowdSecret_FHE platform encrypts donation amounts while still enabling transparent progress updates and fundraising targets. 

Using fhevm to process encrypted inputs, CrowdSecret_FHE maintains contributor anonymity without sacrificing the platform's functionality. This combination of security and usability fosters a trustworthy environment for fundraising.

## Key Features

- 🔒 **Anonymity**: Individual contributions are encrypted, protecting investor identities and amounts.
- 📊 **Homomorphic Progress Updates**: The fundraising progress is dynamically updated in a privacy-preserving manner, even while data remains encrypted.
- 🛡️ **Market Manipulation Prevention**: The encryption prevents large investors from tracking contributions and influencing the crowd.
- 💰 **Transparent Fundraising**: Total funding amounts are visible, providing assurance to contributors while keeping personal data secure.

## Technical Architecture & Stack

- **Core Technology**: Zama’s Fully Homomorphic Encryption
- **Framework**: fhevm for secure computation
- **Languages**: Solidity for smart contracts, JavaScript, and TypeScript for the front-end
- **Databases**: Securely managed off-chain databases

The architecture harnesses Zama's capabilities to enable secure computations while providing an intuitive user experience.

## Smart Contract / Core Logic

Here's a simplified example of how to implement contribution logic in Solidity while utilizing Zama's encryption:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "TFHE.sol";

contract CrowdSecret {
    mapping(address => uint256) private contributions;

    function contribute(uint256 encryptedAmount) public {
        // Decrypt the given amount
        uint256 amount = TFHE.decrypt(encryptedAmount);
        contributions[msg.sender] += amount;
    }

    function totalContributions() public view returns (uint256) {
        uint256 total = 0;
        // Logic to calculate total contributions
        return TFHE.add(total, contributions[msg.sender]);  // Example usage of TFHE.add
    }
}
```

This pseudocode illustrates how contributions are handled securely, protecting both the amount and the contributor's identity.

## Directory Structure

Here's the directory structure for the CrowdSecret_FHE project:

```
CrowdSecret_FHE/
│
├── contracts/
│   └── CrowdSecret.sol
│
├── scripts/
│   └── deploy.js
│
├── src/
│   ├── index.js
│   └── crowdfunding.js
│
├── test/
│   ├── CrowdSecret.test.js
│   └── utils.test.js
│
└── README.md
```

## Installation & Setup

### Prerequisites

To run the CrowdSecret_FHE application, ensure you have the following installed:

- Node.js
- npm package manager
- A compatible Ethereum wallet (like MetaMask)

### Installation Steps

1. Install project dependencies:

   ```bash
   npm install
   npm install fhevm
   ```

2. Install the required Zama library for FHE operations:

   ```bash
   npm install tfhe
   ```

## Build & Run

Once installed, you can build and run the application using the following commands:

- Compile the smart contracts:

   ```bash
   npx hardhat compile
   ```

- Run the application:

   ```bash
   node src/index.js
   ```

## Acknowledgements

We would like to express our sincere gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their innovative technology enables us to enhance data privacy and security in the crowdfunding space.

---

CrowdSecret_FHE is at the forefront of leveraging cutting-edge encryption technology to redefine how we think about privacy in crowdfunding. By utilizing Zama's powerful FHE tools, we ensure that contributors can support projects transparently while maintaining their personal data security. Join us in advancing the future of confidential crowdfunding!

