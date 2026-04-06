const queries = {
	PHILIPS_CT: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables
		)
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality LIKE '%CT'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
    `,
	PHILIPS_CV: `
    SELECT
	  sys.id,
    sys.manufacturer,
    sys.modality,
	sites.time_zone_id,
    ac.debian_server_path,
	json_agg(
		json_build_object(
			'file_name',
			log.file_name,
			'dir_name',
			log.dir_name,
			'parsers',
			log.regex_models,
			'pg_tables',
			log.pg_tables
		)
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'CV/IR'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
    `,
	PHILIPS_MRI_MONITOR_1: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 1
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id,
	ac.debian_server_path;
      `,
	PHILIPS_MRI_MONITOR_2: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 2
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
	PHILIPS_MRI_MONITOR_3: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 3
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
	PHILIPS_MRI_MONITOR_4: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 4
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
      `,
	PHILIPS_MRI_MONITOR_5: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS monitoring_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 5
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name = 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
  `,
	PHILIPS_MRI_RMMU_1: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	ac.run_group = 1
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
  `,
	PHILIPS_MRI_RMMU_2: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 2
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;
  `,
	PHILIPS_MRI_RMMU_3: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 3
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;`,
	PHILIPS_MRI_RMMU_4: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 4
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;              
 `,
	PHILIPS_MRI_RMMU_5: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_agg(
		json_build_object(
			'dir_name',
			mag.dir_name,
			'file_name',
			mag.file_name,
			'parsers',
			mag.regex_models,
			'pg_tables',
			mag.pg_tables,
			'column_name',
			mag.column_name,
			'agg',
			mag.agg,
			'debian_server_path',
			ac.debian_server_path
		)
	) AS rmmu_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.mag mag ON mag.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	ac.run_group = 5
	AND mag.dir_name IS NOT NULL
	AND mag.dir_name != 'monitoring'
GROUP BY
	sys.id,
	ac.system_id,
	sites.time_zone_id;                                  
 `,
	PHILIPS_MRI_LOG_1: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 1
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
	PHILIPS_MRI_LOG_2: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id 
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 2
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
	PHILIPS_MRI_LOG_3: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 3
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
	PHILIPS_MRI_LOG_4: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 4
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `,
	PHILIPS_MRI_LOG_5: `
  SELECT
	sys.id,
	sys.manufacturer,
	sys.modality,
	sites.time_zone_id,
	ac.debian_server_path,
	json_build_object(
		'file_name',
		log.file_name,
		'dir_name',
		log.dir_name,
		'parsers',
		log.regex_models,
		'pg_tables',
		log.pg_tables
	) AS log_config
FROM
	systems sys
	JOIN config.acquisition ac ON ac.system_id = sys.id
	JOIN config.log log ON log.system_id = sys.id
	JOIN sites ON sites.id = sys.site_id
WHERE
	sys.manufacturer = 'Philips'
	AND sys.modality = 'MRI'
	AND ac.run_group = 5
GROUP BY
	sys.id,
	ac.system_id,
	log.file_name,
	log.dir_name,
	log.regex_models,
	log.pg_tables,
	sites.time_zone_id;
  `
};

module.exports = queries;
