pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timeout(time: 60, unit: 'MINUTES')
  }

  triggers {
    pollSCM('H/2 * * * *')
  }

  environment {
    DOCKERHUB_USER = 'karouifares'
    TAG            = "1.0.${BUILD_NUMBER}"
    COMPOSE_PARALLEL_LIMIT = '2'
    BUILDX_NO_DEFAULT_ATTESTATIONS = '1'
  }

  stages {

    stage('Git') {
      steps {
        checkout scm
      }
    }

    stage('Building image') {
      steps {
        sh 'docker compose build'
      }
    }

    stage('Deploy Image') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials',
                                          usernameVariable: 'DH_USER',
                                          passwordVariable: 'DH_PASS')]) {
          sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'

          script {
            def services = ['identity-service', 'product-service', 'customer-service',
                            'order-service', 'api-gateway', 'frontend']
            for (s in services) {
              retry(3) {
                sh "docker compose push ${s}"
              }
            }
          }

          sh 'docker logout'
        }
      }
    }

    stage('Docker Compose Up') {
      steps {
        sh 'docker compose up -d'
      }
    }

    stage('Smoke test') {
      steps {
        sh '''
          for i in $(seq 1 30); do
            curl -sf http://localhost:5000/health && exit 0
            sleep 2
          done
          echo "Le gateway ne répond pas"
          exit 1
        '''
      }
    }
  }

  post {
    always  { sh 'docker compose ps' }
    failure { sh 'docker compose logs --tail=50' }
  }
}
