// Declarative Pipeline for building Node.js application and running SonarQube analysis triggered by a push event.
pipeline {
    // Defines the execution environment. Using 'agent any' to ensure an agent is available.
    agent any 

    // Global environment block removed to prevent Groovy scoping issues with manual path calculation.

    stages {
        // Stage 1: Checkout the code (Relies on the initial SCM checkout done by Jenkins)
        stage('Source Checkout') {
            steps {
                echo "Workspace already populated by the initial SCM checkout. Proceeding."
            }
        }

        // Jenkins is an optional retained consumer. Provision the pinned tools
        // on its agent; do not install a drifting system Node during a build.
        stage('Setup Environment and Tools') {
            steps {
                sh '''
                    set -eu
                    command -v curl
                    command -v unzip
                    test "$(node -v)" = "v22.23.2"
                    test "$(pnpm -v)" = "10.6.1"
                '''
            }
        }

        // Stage 3: Install dependencies and build the application
        stage('Install and Build') {
            steps {
                sh 'pnpm install --frozen-lockfile'
                sh 'pnpm run build'
            }
        }

        // Stage 4: Run SonarQube analysis: Install scanner, get version, and execute.
        stage('SonarQube Analysis') {
            steps {
                script {
                    // 1. Get the short 8-character commit SHA for project versioning
                    def commitShaShort = sh(returnStdout: true, script: 'git rev-parse --short=8 HEAD').trim()
                    echo "Commit SHA (short) is: ${commitShaShort}"
                    
                    // --- 2. MANUALLY INSTALL THE SONAR SCANNER CLI LOCALLY IN THIS STAGE ---
                    sh """
                        echo "Manually downloading and installing Sonar Scanner CLI..."
                        
                        # Download the stable scanner CLI package
                        curl -sS -o sonar-scanner.zip \
                        "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-4.7.0.2747.zip"
                        
                        # Added -o flag to force overwrite and prevent interactive prompt failure
                        unzip -o -q sonar-scanner.zip -d .
                    """

                    // 3. Find the extracted directory name and capture the full absolute bin path in Groovy
                    // This is defined locally and used directly, avoiding environment variable issues.
                    def scannerBinPath = sh(
                        returnStdout: true,
                        script: '''
                            SCANNER_DIR=$(find . -maxdepth 1 -type d -name "sonar-scanner*" | head -n 1)
                            # Get the full absolute path to the executable file
                            echo \$(pwd)/\${SCANNER_DIR}/bin/sonar-scanner
                        '''
                    ).trim()
                    
                    echo "Scanner executable path captured: ${scannerBinPath}"
                    
                    // 4. Use withSonarQubeEnv to set up the secure variables (HOST and TOKEN)
                    withSonarQubeEnv(installationName: 'SonarQube-Server') {
                        // 5. Execute the scanner using the Groovy variable directly.
                        sh """
                            echo "Starting SonarQube Analysis for project version: ${commitShaShort}"
                            
                            # Execute the full, absolute path captured in the Groovy variable.
                            '${scannerBinPath}' \\
                                -Dsonar.projectVersion=${commitShaShort} \\
                                -Dsonar.sources=.
                                
                            # SONAR_HOST_URL and SONAR_TOKEN are automatically passed as environment variables
                            # by the withSonarQubeEnv block.
                        """
                    }
                }
            }
        }
    }
}
