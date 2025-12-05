# Health Circle: A Private Social Network for Patients

Health Circle is a dedicated platform designed to facilitate anonymous communication among patients with similar health conditions, leveraging Zama's Fully Homomorphic Encryption technology to ensure privacy and security. In this nurturing environment, users can share experiences, offer support, and maintain their anonymity without compromising their sensitive medical information.

## The Challenge of Patient Privacy

In today's digital age, sharing health-related experiences and seeking support is vital for patients. However, existing social networks often fail to protect sensitive medical data, leaving patients vulnerable to privacy breaches and identity theft. Patients with similar conditions need a safe space to express themselves and connect with others, but traditional platforms can expose their identities and personal histories, leading to a lack of trust and reluctance to engage in discourse.

## The FHE Solution

Health Circle addresses these privacy concerns by utilizing Zama's Fully Homomorphic Encryption (FHE) technology. FHE allows user data—including medical histories and identities—to remain encrypted while enabling secure operations on that data. This means that users can interact with the platform and each other without exposing any sensitive information. By implementing Zama's open-source libraries, such as Concrete and TFHE-rs, Health Circle ensures that all sensitive interactions are shielded from unauthorized access while facilitating meaningful connections in a safe environment.

## Key Features

Health Circle is equipped with robust features designed to enhance user experience and security:

- **Encrypted Health Status**: Users' health conditions are FHE encrypted, enabling seamless sharing of information without disclosing personal identifiers.
- **Community Grouping**: Patients are grouped according to encrypted labels, ensuring that discussions remain relevant while protecting individual identities.
- **End-to-End Encrypted Group Chats**: Engage in private conversations within secure group chats that maintain confidentiality.
- **Psychological Safety**: By protecting patient privacy, Health Circle fosters a supportive community environment where users can discuss their feelings and experiences without fear of judgment.

## Technology Stack

Health Circle is built upon a modern technology framework:

- **Backend**: Node.js
- **Smart Contracts**: Solidity for Ethereum
- **Confidential Computing**: Zama's Fully Homomorphic Encryption libraries (Concrete, TFHE-rs)
- **Frontend**: React.js for a dynamic user interface
- **Testing**: Hardhat for smart contract testing

## Directory Structure

The project's directory is organized to facilitate easy navigation and understanding:

```
Health_Circle_FHE/
├── contracts/
│   └── Health_Circle.sol
├── src/
│   ├── components/
│   ├── pages/
│   └── utils/
├── test/
│   └── HealthCircle.test.js
├── package.json
└── README.md
```

## Installation Guide

To set up the Health Circle project, please follow these steps:

1. Ensure that you have **Node.js** installed. You can download it from the official website.
2. Use a package manager (like npm) to install Hardhat for smart contract development.
3. Download the project files to your local machine (**do not use `git clone`**).
4. Navigate to the project directory.

Once you are in the directory, install the necessary dependencies by running:

```bash
npm install
```

This command will also fetch the required Zama FHE libraries, allowing you to leverage their powerful encryption capabilities.

## Build & Run Guide

After successfully installing the dependencies, you can build and run the project using the following commands:

1. **Compile the smart contracts**:

```bash
npx hardhat compile
```

2. **Run tests to ensure everything is working**:

```bash
npx hardhat test
```

3. **Start the development server**:

```bash
npm start
```

This will launch the Health Circle application locally, allowing you to test its functionalities and interact with the community.

## Example Code Snippet

Here is a simple example demonstrating how user health data can be encrypted and shared safely within Health Circle:

```javascript
import { encryptHealthData } from 'zama-fhe-sdk';

const userHealthData = {
  condition: "Diabetes",
  medications: ["Metformin", "Insulin"],
};

// Encrypting user health data
const encryptedData = encryptHealthData(userHealthData);
console.log("Encrypted Health Data: ", encryptedData);
```

In this snippet, the `encryptHealthData` function utilizes Zama's SDK to securely encrypt the user's medical information before it is transmitted or stored, maintaining the confidentiality of sensitive data.

## Powered by Zama

We would like to extend our heartfelt gratitude to the team at Zama for their innovative work in the realm of Fully Homomorphic Encryption. By providing open-source tools and libraries, they enable projects like Health Circle to protect user privacy while fostering secure interactions in decentralized applications. Their commitment to confidential computing is instrumental in our mission to create a safe community for patients.

Join us on this journey of compassion and understanding as we redefine patient communication in a secure and private online space!
