/**
 * @author Pedro Sanders
 * @since v1
 */
const DSUtils = require('@routr/data_api/utils')
const ConfigAPI = require('@routr/data_api/config_api')
const RedisDataSource = require('@routr/data_api/redis_datasource')
const FilesUtil = require('@routr/utils/files_util')
const File = Java.type('java.io.File')
const System = Java.type('java.lang.System')
const InetAddress = Java.type('java.net.InetAddress')
const UUID = Java.type('java.util.UUID')
const LogManager = Java.type('org.apache.logging.log4j.LogManager')
const LOG = LogManager.getLogger()
const { Status } = require('@routr/core/status')

const upSince = new Date().getTime()

module.exports = () => loadConfig(upSince)
module.exports.reloadConfig = () => loadConfig(upSince)

function loadConfig (upSince) {
  let config = getConfigFromFile()
  config.salt = getSalt()

  if (config.spec === undefined) config.spec = {}
  config.spec.securityContext = getDefaultSecContext(
    config.spec.securityContext
  )
  const spec = getSysPresets(config.spec)
  config.spec.externAddr = spec.externAddr
  config.spec.localnets = spec.localnets
  config.spec.dataSource = spec.dataSource
  config.spec.registrarIntf = spec.registrarIntf
  config.spec.restService = getRestfulPresets(config.spec.restService)
  config.spec.grpcService = getGRPCPresets(config.spec.grpcService)
  config.system = getSystemConfig(upSince)

  if (config.spec.registrarIntf === undefined)
    config.spec.registrarIntf = 'External'
  // Trying to use 0.0.0.0 or :: causes routing issues
  if (config.spec.bindAddr === undefined)
    config.spec.bindAddr = InetAddress.getLocalHost().getHostAddress()
  if (config.spec.dataSource === undefined)
    config.spec.dataSource = {
      provider: 'files_data_provider'
    }
  if (config.metadata === undefined) config.metadata = {}
  if (config.metadata.userAgent === undefined)
    config.metadata.userAgent = `Routr ${config.system.version}`
  if (config.spec.transport === undefined)
    config.spec.transport = [{ protocol: 'tcp', port: 5060 }]
  if (config.spec.accessControlList === undefined)
    config.spec.accessControlList = { allow: [], deny: [] }
  if (config.spec.accessControlList.allow === undefined)
    config.spec.accessControlList.allow = []
  if (config.spec.accessControlList.allow === undefined)
    config.spec.accessControlList.deny = []

  if (
    config.spec.dataSource &&
    config.spec.dataSource.provider === 'redis_data_provider'
  ) {
    // WARNING: This will have to be change once we add new data provider
    // to avoid a circular dependency with the DSSelector
    const response = new ConfigAPI(new RedisDataSource(config)).getConfig()
    if (response.status === Status.OK) {
      config = response.data
    } else {
      LOG.error('Unable to run server: Ensure your Redis server is running')
      System.exit(1)
    }
  }

  return config
}

function getRestfulPresets (rs) {
  const restService = rs === undefined ? {} : rs

  if (restService.keyStore === undefined) {
    restService.keyStore = 'etc/certs/api-cert.jks'
    restService.keyStorePassword = 'changeit'
  }

  if (restService.unsecured === undefined) restService.unsecured = false
  //if (restService.trustStore === undefined) restService.trustStore = null
  //if (restService.trustStorePassword === undefined) restService.trustStorePassword = null
  if (restService.bindAddr === undefined) restService.bindAddr = '0.0.0.0'
  if (restService.port === undefined) restService.port = 4567
  if (restService.maxThreads === undefined) restService.maxThreads = 200
  if (restService.minThreads === undefined) restService.minThreads = 8
  if (restService.timeOutMillis === undefined) restService.timeOutMillis = 5000

  return restService
}

function getGRPCPresets (g) {
  const grpcService = g === undefined ? {} : g
  if (grpcService.bindAddr === undefined)
    grpcService.bindAddr = InetAddress.getLocalHost().getHostAddress()
  if (grpcService.port === undefined) grpcService.port = 50099
  return grpcService
}

function getSysPresets (s) {
  const spec = s === undefined ? {} : s

  if (System.getenv('ROUTR_EXTERN_ADDR') !== null) {
    spec.externAddr = System.getenv('ROUTR_EXTERN_ADDR')
  }

  if (System.getenv('ROUTR_LOCALNETS') !== null) {
    spec.localnets = System.getenv('ROUTR_LOCALNETS').split(',')
  }

  if (System.getenv('ROUTR_DS_PROVIDER') !== null) {
    spec.dataSource = {
      provider: System.getenv('ROUTR_DS_PROVIDER')
    }
  }

  if (System.getenv('ROUTR_REGISTRAR_INTF') !== null) {
    spec.registrarIntf = System.getenv('ROUTR_REGISTRAR_INTF')
  }

  return spec
}

function getDefaultSecContext (sc) {
  const securityContext = sc === undefined ? {} : sc

  if (securityContext.client === undefined) {
    securityContext.client = {}
  }

  if (securityContext.client.authType === undefined) {
    securityContext.client.authType = 'DisabledAll'
  }

  if (securityContext.client.protocols === undefined) {
    securityContext.client.protocols = ['SSLv3', 'TLSv1.2', 'TLSv1.1', 'TLSv1']
  }

  if (securityContext.debugging === undefined) {
    securityContext.debugging = false
  }

  if (securityContext.keyStore === undefined) {
    securityContext.keyStore = 'etc/certs/domains-cert.jks'
  }

  if (securityContext.trustStore === undefined) {
    securityContext.trustStore = 'etc/certs/domains-cert.jks'
  }

  if (securityContext.keyStorePassword === undefined) {
    securityContext.keyStorePassword = 'changeit'
  }

  if (securityContext.trustStorePassword === undefined) {
    securityContext.trustStorePassword = 'changeit'
  }

  if (securityContext.keyStoreType === undefined) {
    securityContext.keyStoreType = 'jks'
  }

  return securityContext
}

function getSystemConfig (upSince) {
  const system = {}
  system.version = 'v1.0'
  system.apiVersion = 'v1beta1'
  system.apiPath = `/api/${system.apiVersion}`
  system.upSince = upSince
  system.env = []
  system.env.push({
    var: 'ROUTR_JAVA_OPTS',
    value: System.getenv('ROUTR_JAVA_OPTS')
  })
  system.env.push({
    var: 'ROUTR_DS_PROVIDER',
    value: System.getenv('ROUTR_DS_PROVIDER')
  })
  system.env.push({
    var: 'ROUTR_DS_PARAMETERS',
    value: System.getenv('ROUTR_DS_PARAMETERS')
  })
  system.env.push({
    var: 'ROUTR_CONFIG_FILE',
    value: System.getenv('ROUTR_CONFIG_FILE')
  })
  system.env.push({
    var: 'ROUTR_SALT',
    value: System.getenv('ROUTR_SALT')
  })
  system.env.push({
    var: 'ROUTR_EXTERN_ADDR',
    value: System.getenv('ROUTR_EXTERN_ADDR')
  })
  system.env.push({
    var: 'ROUTR_LOCALNETS',
    value: System.getenv('ROUTR_LOCALNETS')
  })
  system.env.push({
    var: 'ROUTR_REGISTRAR_INTF',
    value: System.getenv('ROUTR_REGISTRAR_INTF')
  })
  system.env.push({
    var: 'ROUTR_JS_ENGINE',
    value: System.getenv('ROUTR_JS_ENGINE')
  })
  return system
}

function getConfigFromFile () {
  let config
  try {
    if (System.getenv('ROUTR_CONFIG_FILE') !== null) {
      config = DSUtils.convertToJson(
        FilesUtil.readFile(System.getenv('ROUTR_CONFIG_FILE'))
      )
    } else {
      config = DSUtils.convertToJson(FilesUtil.readFile('config/config.yml'))
    }
    return config
  } catch (e) {
    print('Unable to open configuration file')
    System.exit(1)
  }
}

function getSalt () {
  if (System.getenv('ROUTR_SALT') !== null) return System.getenv('ROUTR_SALT')

  const pathToSalt =
    System.getenv('ROUTR_SALT_FILE') !== null
      ? System.getenv('ROUTR_SALT_FILE')
      : `${System.getProperty('user.dir')}/.routr.salt`

  const f = new File(pathToSalt)

  if (f.exists() && !f.isDirectory()) return FilesUtil.readFile(pathToSalt)

  const genSalt = UUID.randomUUID()
    .toString()
    .replace(/\-/g, '')
  FilesUtil.writeFile(pathToSalt, genSalt)

  return genSalt
}
