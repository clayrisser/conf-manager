import MultithreadConfig from 'multithread-config';
import fs from 'fs-extra';
import mergeConfiguration from 'merge-configuration';
import path from 'path';
import pkgDir from 'pkg-dir';
import { CosmiconfigResult } from 'cosmiconfig/dist/types';
import { cosmiconfigSync } from 'cosmiconfig';
import { homedir } from 'os';
import { BaseConfig, Pkg } from './types';

export interface Options<Config = BaseConfig> {
  loadHomeConfig?: (() => Partial<Config>) | boolean;
  loadProjectConfig?: (() => Partial<Config>) | boolean;
  multithread: boolean;
  name?: string;
  projectConfigPath?: string;
}

export default class ConfManager<Config = BaseConfig> {
  _config: Config;

  _name: string;

  multithreadConfig?: MultithreadConfig;

  options: Options<Config>;

  rootPath = pkgDir.sync(process.cwd()) || process.cwd();

  constructor(
    options: Partial<Options<Config>> = {},
    public optionsConfig: Partial<Config> = {},
    public defaultConfig: Partial<Config> = {}
  ) {
    this.options = {
      multithread: false,
      ...options
    };
    if (
      typeof options.loadHomeConfig === 'function' ||
      options.loadHomeConfig === false
    ) {
      this.loadHomeConfig =
        options.loadHomeConfig === false
          ? (): Partial<Config> => ({})
          : options.loadHomeConfig;
    }
    if (
      typeof options.loadProjectConfig === 'function' ||
      options.loadProjectConfig === false
    ) {
      this.loadProjectConfig =
        options.loadProjectConfig === false
          ? (): Partial<Config> => ({})
          : options.loadProjectConfig;
    }
    this._config = this.loadConfig();
    if (this.options.multithread) {
      this.multithreadConfig = new MultithreadConfig({
        name: this.options.name
      });
      this.multithreadConfig.startSync();
      this.multithreadConfig?.setConfigSync<Config>(this._config);
    }
  }

  get name(): string {
    if (this._name) return this._name;
    const pkgPath = path.resolve(this.rootPath, 'package.json');
    const pkg: Partial<Pkg> = fs.pathExistsSync(pkgPath)
      ? fs.readJsonSync(pkgPath)
      : {};
    this._name =
      this.options.name || pkg.name || __dirname.replace(/^.+\//, '');
    return this._name;
  }

  get homeConfig(): Partial<Config> {
    return this.loadHomeConfig();
  }

  get projectConfig(): Partial<Config> {
    return this.loadProjectConfig();
  }

  loadHomeConfig(): Partial<Config> {
    return this.loadFileConfig(homedir());
  }

  loadProjectConfig(): Partial<Config> {
    if (this.options.projectConfigPath) {
      return this.loadFileConfig(this.options.projectConfigPath, true);
    }
    return this.loadFileConfig(this.rootPath);
  }

  loadFileConfig(configPath: string, isFile = false): Partial<Config> {
    try {
      const cc = cosmiconfigSync(this.name);
      let result: CosmiconfigResult;
      if (isFile) {
        result = cc?.load(configPath);
      } else {
        result = cc?.search(configPath);
      }
      return (result?.config || {}) as Partial<Config>;
    } catch (err) {
      if (err.name !== 'YAMLException') throw err;
      return require(err.mark.name);
    }
  }

  get config(): Config {
    if (!this.options.multithread) return this._config as Config;
    const config = this.multithreadConfig?.getConfigSync<Config>();
    if (!config) throw new Error('failed to retrieve multithread config');
    return config;
  }

  set config(config: Config) {
    Object.keys(this._config).forEach(
      (key: string) =>
        ((this._config as BaseConfig)[key] = (config as BaseConfig)[key])
    );
    this.multithreadConfig?.setConfigSync<Config>(this._config);
  }

  mergeConfig(config: Partial<Config>): Config {
    this.config = mergeConfiguration<Config>(this.config, config);
    return this.config;
  }

  loadConfig(config: Partial<Config> = {}): Config {
    return mergeConfiguration<Config>(
      mergeConfiguration<Config>(
        mergeConfiguration<Config>(
          mergeConfiguration<Config>(
            this.defaultConfig as Config,
            this.homeConfig
          ),
          this.projectConfig
        ),
        this.optionsConfig
      ),
      config
    );
  }
}
